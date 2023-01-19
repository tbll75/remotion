import type {Codec, StillImageFormat} from '@remotion/renderer';
import {BrowserSafeApis} from '@remotion/renderer/client';
import type {ChangeEvent} from 'react';
import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react';
import {Internals} from 'remotion';
import type {TComposition} from 'remotion/src/internals';
import {Button} from '../../../preview-server/error-overlay/remotion-overlay/Button';
import {LIGHT_TEXT} from '../../helpers/colors';
import {useFileExistence} from '../../helpers/use-file-existence';
import {ModalsContext} from '../../state/modals';
import {CollapsableOptions} from '../CollapsableOptions';
import {Spacing} from '../layout';
import {ModalContainer} from '../ModalContainer';
import {NewCompHeader} from '../ModalHeader';
import {InputDragger} from '../NewComposition/InputDragger';
import {RemotionInput} from '../NewComposition/RemInput';
import {ValidationMessage} from '../NewComposition/ValidationMessage';
import {addStillRenderJob, addVideoRenderJob} from '../RenderQueue/actions';
import type {SegmentedControlItem} from '../SegmentedControl';
import {SegmentedControl} from '../SegmentedControl';
import {leftSidebarTabs} from '../SidebarContent';

type State =
	| {
			type: 'idle';
	  }
	| {
			type: 'success';
	  }
	| {
			type: 'load';
	  }
	| {
			type: 'error';
	  };

const initialState: State = {type: 'idle'};

export type RenderType = 'still' | 'video';

type Action =
	| {
			type: 'start';
	  }
	| {
			type: 'succeed';
	  }
	| {
			type: 'fail';
	  };

const reducer = (state: State, action: Action): State => {
	if (action.type === 'start') {
		return {
			type: 'load',
		};
	}

	if (action.type === 'fail') {
		return {
			type: 'error',
		};
	}

	if (action.type === 'succeed') {
		return {
			type: 'success',
		};
	}

	return state;
};

const container: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'row',
	alignItems: 'center',
	padding: '12px 16px',
	width: '100%',
	borderBottom: '1px solid black',
};

const optionRow: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'row',
	alignItems: 'flex-start',
	minHeight: 40,
	paddingLeft: 16,
	paddingRight: 16,
};

const label: React.CSSProperties = {
	width: 150,
	fontSize: 14,
	lineHeight: '40px',
	color: LIGHT_TEXT,
};

const rightRow: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'row',
	justifyContent: 'flex-end',
	alignSelf: 'center',
	flex: 1,
};

const buttonRow: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'row',
	justifyContent: 'flex-end',
	borderTop: '1px solid black',
	paddingTop: 8,
	paddingBottom: 8,
	paddingLeft: 16,
	paddingRight: 16,
};

const input: React.CSSProperties = {
	minWidth: 250,
	textAlign: 'right',
};

const MIN_QUALITY = 1;
const MAX_QUALITY = 100;

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

export const RenderModal: React.FC<{
	compositionId: string;
	initialFrame: number;
	initialImageFormat: StillImageFormat;
	initialQuality: number | null;
	initialScale: number;
	initialVerbose: boolean;
	initialOutName: string;
	initialRenderType: RenderType;
	initialCodec: Codec;
	initialConcurrency: number;
	minConcurrency: number;
	maxConcurrency: number;
}> = ({
	compositionId,
	initialFrame,
	initialImageFormat,
	initialQuality,
	initialScale,
	initialVerbose,
	initialOutName,
	initialRenderType,
	initialCodec,
	initialConcurrency,
	maxConcurrency,
	minConcurrency,
}) => {
	const {setSelectedModal} = useContext(ModalsContext);

	const onQuit = useCallback(() => {
		setSelectedModal(null);
	}, [setSelectedModal]);

	const isMounted = useRef(true);

	const [state, dispatch] = useReducer(reducer, initialState);
	const [unclampedFrame, setFrame] = useState(() => initialFrame);

	const [imageFormat, setImageFormat] = useState<StillImageFormat>(
		() => initialImageFormat
	);
	const [concurrency, setConcurrency] = useState(() => initialConcurrency);
	const [videoCodec, setVideoCodec] = useState<Codec>(initialCodec);
	const [videoImageFormat, setVideoImageFormat] =
		useState<StillImageFormat>('jpeg');
	const [renderMode, setRenderMode] = useState<RenderType>(initialRenderType);
	const [quality, setQuality] = useState<number>(() => initialQuality ?? 80);
	const [scale, setScale] = useState(() => initialScale);
	const [verbose, setVerboseLogging] = useState(() => initialVerbose);
	const [outName, setOutName] = useState(() => initialOutName);
	const dispatchIfMounted: typeof dispatch = useCallback((payload) => {
		if (isMounted.current === false) return;
		dispatch(payload);
	}, []);

	const onValueChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
		(e) => {
			setOutName(e.target.value);
		},
		[]
	);

	const {compositions} = useContext(Internals.CompositionManager);

	const currentComposition = useMemo((): TComposition | null => {
		for (const composition of compositions) {
			if (composition.id === compositionId) {
				return composition;
			}
		}

		return null;
	}, [compositionId, compositions]);

	if (currentComposition === null) {
		throw new Error('This composition does not exist');
	}

	const frame = useMemo(() => {
		return Math.min(currentComposition.durationInFrames - 1, unclampedFrame);
	}, [currentComposition.durationInFrames, unclampedFrame]);

	const getStringBeforeSuffix = useCallback((fileName: string) => {
		const dotPos = fileName.lastIndexOf('.');
		const bitBeforeDot = fileName.substring(0, dotPos);
		return bitBeforeDot;
	}, []);

	const setCodec = useCallback(
		(codec: Codec) => {
			setVideoCodec(codec);
			setOutName((prev) => {
				const codecSuffix = BrowserSafeApis.getFileExtensionFromCodec(codec);
				const newFileName = getStringBeforeSuffix(prev) + '.' + codecSuffix;
				return newFileName;
			});
		},
		[getStringBeforeSuffix]
	);

	const setStillFormat = useCallback(
		(format: StillImageFormat) => {
			setImageFormat(format);
			setOutName((prev) => {
				const newFileName = getStringBeforeSuffix(prev) + '.' + format;
				return newFileName;
			});
		},
		[getStringBeforeSuffix]
	);

	const onClickStill = useCallback(() => {
		leftSidebarTabs.current?.selectRendersPanel();
		dispatchIfMounted({type: 'start'});
		addStillRenderJob({
			compositionId,
			outName,
			imageFormat,
			quality: imageFormat === 'jpeg' ? quality : null,
			frame,
			scale,
			verbose,
		})
			.then(() => {
				dispatchIfMounted({type: 'succeed'});
				setSelectedModal(null);
			})
			.catch(() => {
				dispatchIfMounted({type: 'fail'});
			});
	}, [
		compositionId,
		dispatchIfMounted,
		frame,
		imageFormat,
		outName,
		quality,
		scale,
		setSelectedModal,
		verbose,
	]);

	const onClickVideo = useCallback(() => {
		leftSidebarTabs.current?.selectRendersPanel();
		dispatchIfMounted({type: 'start'});
		addVideoRenderJob({
			compositionId,
			outName,
			imageFormat: videoImageFormat,
			quality: imageFormat === 'jpeg' ? quality : null,
			scale,
			verbose,
			codec: videoCodec,
			concurrency,
		})
			.then(() => {
				dispatchIfMounted({type: 'succeed'});
				setSelectedModal(null);
			})
			.catch(() => {
				dispatchIfMounted({type: 'fail'});
			});
	}, [
		compositionId,
		dispatchIfMounted,
		imageFormat,
		outName,
		quality,
		scale,
		setSelectedModal,
		verbose,
		videoCodec,
		videoImageFormat,
		concurrency,
	]);

	const onQualityChangedDirectly = useCallback((newQuality: number) => {
		setQuality(newQuality);
	}, []);

	const onQualityChanged = useCallback((e: string) => {
		setQuality((q) => {
			const newQuality = parseInt(e, 10);
			if (Number.isNaN(newQuality)) {
				return q;
			}

			const newQualityClamped = Math.min(
				MAX_QUALITY,
				Math.max(newQuality, MIN_QUALITY)
			);
			return newQualityClamped;
		});
	}, []);

	const onConcurrencyChangedDirectly = useCallback((newConcurrency: number) => {
		setConcurrency(newConcurrency);
	}, []);

	const onConcurrencyChanged = useCallback(
		(e: string) => {
			setConcurrency((q) => {
				const newConcurrency = parseInt(e, 10);
				if (Number.isNaN(newConcurrency)) {
					return q;
				}

				const newConcurrencyClamped = Math.min(
					maxConcurrency,
					Math.max(newConcurrency, minConcurrency)
				);
				return newConcurrencyClamped;
			});
		},
		[maxConcurrency, minConcurrency]
	);

	const onScaleSetDirectly = useCallback((newScale: number) => {
		setScale(newScale);
	}, []);

	const onScaleChanged = useCallback((e: string) => {
		setScale((q) => {
			const newScale = parseFloat(e);
			if (Number.isNaN(newScale)) {
				return q;
			}

			const newScaleClamped = Math.min(
				MAX_SCALE,
				Math.max(newScale, MIN_SCALE)
			);
			return newScaleClamped;
		});
	}, []);

	const onFrameSetDirectly = useCallback(
		(newFrame: number) => {
			if (newFrame > currentComposition.durationInFrames - 1) {
				setFrame(currentComposition.durationInFrames - 1);
			} else {
				setFrame(newFrame);
			}
		},
		[currentComposition.durationInFrames, setFrame]
	);

	const onFrameChanged = useCallback(
		(e: string) => {
			setFrame((q) => {
				const newFrame = parseFloat(e);
				if (Number.isNaN(newFrame)) {
					return q;
				}

				return newFrame > currentComposition.durationInFrames - 1
					? currentComposition.durationInFrames - 1
					: newFrame;
			});
		},
		[currentComposition.durationInFrames]
	);

	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	const existence = useFileExistence(outName);

	const imageFormatOptions = useMemo((): SegmentedControlItem[] => {
		return [
			{
				label: 'PNG',
				onClick:
					renderMode === 'still'
						? () => setStillFormat('png')
						: () => setVideoImageFormat('png'),
				key: 'png',
				selected:
					renderMode === 'still'
						? imageFormat === 'png'
						: videoImageFormat === 'png',
			},
			{
				label: 'JPEG',
				onClick:
					renderMode === 'still'
						? () => setStillFormat('jpeg')
						: () => setVideoImageFormat('jpeg'),
				key: 'jpeg',
				selected:
					renderMode === 'still'
						? imageFormat === 'jpeg'
						: videoImageFormat === 'jpeg',
			},
		];
	}, [imageFormat, renderMode, setStillFormat, videoImageFormat]);

	const videoCodecOptions = useMemo((): SegmentedControlItem[] => {
		return BrowserSafeApis.validCodecs.map((codec) => {
			return {
				label: codec,
				onClick: () => setCodec(codec),
				key: codec,
				selected: videoCodec === codec,
			};
		});
	}, [setCodec, videoCodec]);

	const renderTabOptions = useMemo((): SegmentedControlItem[] => {
		if (currentComposition?.durationInFrames < 2) {
			return [
				{
					label: 'Still',
					onClick: () => {
						setRenderMode('still');
						setStillFormat(imageFormat);
					},
					key: 'still',
					selected: renderMode === 'still',
				},
			];
		}

		return [
			{
				label: 'Still',
				onClick: () => {
					setRenderMode('still');
					setStillFormat(imageFormat);
				},
				key: 'still',
				selected: renderMode === 'still',
			},
			{
				label: 'Video',
				onClick: () => {
					setRenderMode('video');
					setCodec(videoCodec);
				},
				key: 'video',
				selected: renderMode === 'video',
			},
		];
	}, [
		currentComposition?.durationInFrames,
		imageFormat,
		renderMode,
		setCodec,
		setStillFormat,
		videoCodec,
	]);

	const onVerboseLoggingChanged = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			setVerboseLogging(e.target.checked);
		},
		[]
	);

	if (renderMode === 'still') {
		return (
			<ModalContainer onOutsideClick={onQuit} onEscape={onQuit}>
				<NewCompHeader title={`Render ${compositionId}`} />
				<div style={container}>
					<SegmentedControl items={renderTabOptions} needsWrapping={false} />
				</div>
				<div>
					<Spacing block y={0.5} />
					<div style={optionRow}>
						<div style={label}>Format</div>
						<div style={rightRow}>
							<SegmentedControl items={imageFormatOptions} needsWrapping />
						</div>
					</div>
					<div style={optionRow}>
						<div style={label}>Output name</div>
						<div style={rightRow}>
							<div>
								<RemotionInput
									// TODO: Validate and reject folders or weird file names
									warning={existence}
									style={input}
									type="text"
									value={outName}
									onChange={onValueChange}
								/>
								{existence ? (
									<ValidationMessage
										align="flex-end"
										message="Will be overwritten"
									/>
								) : null}
							</div>
						</div>
					</div>
					{currentComposition.durationInFrames > 1 ? (
						<div
							style={optionRow}
							// TODO: Add framerange for video
						>
							<div style={label}>Frame</div>
							<div style={rightRow}>
								<InputDragger
									value={frame}
									onTextChange={onFrameChanged}
									placeholder={`0-${currentComposition.durationInFrames - 1}`}
									// TODO: Debug the number input field
									onValueChange={onFrameSetDirectly}
									name="frame"
									step={1}
									min={0}
									// TODO: Add actual frame
									max={currentComposition.durationInFrames - 1}
								/>{' '}
							</div>
						</div>
					) : null}

					<CollapsableOptions
						showLabel="Show advanced settings"
						hideLabel="Hide advanced settings"
					>
						<div style={optionRow}>
							<div style={label}>Scale</div>
							<div style={rightRow}>
								<InputDragger
									value={scale}
									onTextChange={onScaleChanged}
									placeholder="0.1-10"
									// TODO: Does not allow non-integer steps
									// TODO: Cannot click and type in 0.2
									onValueChange={onScaleSetDirectly}
									name="scale"
									step={0.1}
									min={MIN_SCALE}
									max={MAX_SCALE}
								/>
							</div>
						</div>
						<div style={optionRow}>
							<div style={label}>Verbose logging</div>
							<div style={rightRow}>
								<input
									type={'checkbox'}
									checked={verbose}
									onChange={onVerboseLoggingChanged}
								/>
							</div>
						</div>

						{/* TODO: check if jpeg quality for still and video should be handled seperately */}
						{imageFormat === 'jpeg' && (
							<div style={optionRow}>
								<div style={label}>JPEG Quality</div>
								<div style={rightRow}>
									<InputDragger
										value={quality}
										onTextChange={onQualityChanged}
										placeholder="0-100"
										onValueChange={onQualityChangedDirectly}
										name="quality"
										step={1}
										min={MIN_QUALITY}
										max={MAX_QUALITY}
									/>
								</div>
							</div>
						)}
					</CollapsableOptions>
					<Spacing block y={0.5} />
					<div style={buttonRow}>
						<Button
							autoFocus
							onClick={onClickStill}
							disabled={state.type === 'load'}
						>
							{state.type === 'idle' ? 'Render still' : 'Rendering...'}
						</Button>
					</div>
				</div>
			</ModalContainer>
		);
	}

	return (
		<ModalContainer onOutsideClick={onQuit} onEscape={onQuit}>
			<NewCompHeader title={`Render ${compositionId}`} />
			<div style={container}>
				<SegmentedControl items={renderTabOptions} needsWrapping={false} />
			</div>
			<div>
				<Spacing block y={0.5} />
				<div style={optionRow}>
					<div style={label}>Codec</div>
					<div style={rightRow}>
						<SegmentedControl items={videoCodecOptions} needsWrapping />
					</div>
				</div>
				<div style={optionRow}>
					<div style={label}>Output name</div>
					<div style={rightRow}>
						<div>
							<RemotionInput
								// TODO: Validate and reject folders or weird file names
								warning={existence}
								style={input}
								type="text"
								value={outName}
								onChange={onValueChange}
							/>
							{existence ? (
								<ValidationMessage
									align="flex-end"
									message="Will be overwritten"
								/>
							) : null}
						</div>
					</div>
				</div>
				<CollapsableOptions
					showLabel="Show advanced settings"
					hideLabel="Hide advanced settings"
				>
					<div style={optionRow}>
						<div style={label}>Scale</div>
						<div style={rightRow}>
							<InputDragger
								value={scale}
								onTextChange={onScaleChanged}
								placeholder="0.1-10"
								// TODO: Direct input does not allow non-integer steps
								// TODO: Cannot click and type in 0.2
								onValueChange={onScaleSetDirectly}
								name="scale"
								step={0.1}
								min={MIN_SCALE}
								max={MAX_SCALE}
							/>
						</div>
					</div>
					<div style={optionRow}>
						<div style={label}>Verbose logging</div>
						<div style={rightRow}>
							<input
								type={'checkbox'}
								checked={verbose}
								onChange={onVerboseLoggingChanged}
							/>
						</div>
					</div>
					<div style={optionRow}>
						<div style={label}>Image Format</div>
						<div style={rightRow}>
							<SegmentedControl
								items={imageFormatOptions}
								needsWrapping={false}
							/>
						</div>
					</div>

					{/* TODO: check if jpeg quality for still and video should be handled seperately */}
					{videoImageFormat === 'jpeg' && (
						<div style={optionRow}>
							<div style={label}>JPEG Quality</div>
							<div style={rightRow}>
								<InputDragger
									value={quality}
									onTextChange={onQualityChanged}
									placeholder="0-100"
									onValueChange={onQualityChangedDirectly}
									name="quality"
									step={1}
									min={MIN_QUALITY}
									max={MAX_QUALITY}
								/>
							</div>
						</div>
					)}
					<div style={optionRow}>
						<div style={label}>Concurrency</div>
						<div style={rightRow}>
							<InputDragger
								value={concurrency}
								onTextChange={onConcurrencyChanged}
								// TODO: Set possible values
								placeholder="0-100"
								onValueChange={onConcurrencyChangedDirectly}
								name="concurrency"
								step={1}
								min={minConcurrency}
								max={maxConcurrency}
							/>
						</div>
					</div>
				</CollapsableOptions>
				<Spacing block y={0.5} />
				<div style={buttonRow}>
					<Button
						autoFocus
						onClick={onClickVideo}
						disabled={state.type === 'load'}
					>
						{state.type === 'idle' ? 'Render video' : 'Rendering...'}
					</Button>
				</div>
			</div>
		</ModalContainer>
	);
};