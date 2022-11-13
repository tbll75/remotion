import React from 'react';
import type {RenderJob} from '../../../preview-server/render-queue/job';
import {Row, Spacing} from '../layout';
import {RenderQueueItemStatus} from './RenderQueueItemStatus';
import {RenderQueueOutputName} from './RenderQueueOutputName';
import {RenderQueueRemoveItem} from './RenderQueueRemoveItem';

const container: React.CSSProperties = {
	padding: 12,
	display: 'flex',
	flexDirection: 'row',
	paddingBottom: 10,
};

const title: React.CSSProperties = {
	fontSize: 13,
	lineHeight: 1,
};

const right: React.CSSProperties = {
	flex: 1,
};

export const RenderQueueItem: React.FC<{
	job: RenderJob;
}> = ({job}) => {
	return (
		<Row style={container} align="center">
			<RenderQueueItemStatus job={job} />
			<Spacing x={1} />
			<div style={right}>
				<div style={title}>{job.compositionId}</div>
				<RenderQueueOutputName job={job} />
			</div>
			<RenderQueueRemoveItem job={job} />
		</Row>
	);
};