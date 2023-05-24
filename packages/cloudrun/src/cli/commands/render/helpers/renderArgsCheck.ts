import {CliInternals} from '@remotion/cli';

import {getCompositions} from '@remotion/renderer';
import {getOrCreateBucket} from '../../../../api/get-or-create-bucket';
import {getServiceInfo} from '../../../../api/get-service-info';
import {getServices} from '../../../../api/get-services';
import {
	BINARY_NAME,
	DEFAULT_OUTPUT_PRIVACY,
} from '../../../../shared/constants';
import {convertToServeUrl} from '../../../../shared/convert-to-serve-url';
import {validatePrivacy} from '../../../../shared/validate-privacy';
import {validateServeUrl} from '../../../../shared/validate-serveurl';
import {parsedCloudrunCli} from '../../../args';
import {getGcpRegion} from '../../../get-gcp-region';
import {quit} from '../../../helpers/quit';
import {Log} from '../../../log';
import {SERVICES_COMMAND} from '../../services';
import {CLOUD_RUN_DEPLOY_SUBCOMMAND} from '../../services/deploy';

export const renderArgsCheck = async (subcommand: string, args: string[]) => {
	let region = getGcpRegion();
	let remotionBucket;

	let serveUrl = args[0];
	if (!serveUrl) {
		Log.error('No serve URL passed.');
		Log.info(
			'Pass an additional argument specifying a URL where your Remotion project is hosted.'
		);
		Log.info();
		Log.info(
			`${BINARY_NAME} ${subcommand} <serve-url> <composition-id> [output-location]`
		);
		quit(1);
	}

	if (!serveUrl.startsWith('https://') && !serveUrl.startsWith('http://')) {
		const siteName = serveUrl;
		Log.verbose('Remotion site-name passed, constructing serve url...');
		region = region ?? getGcpRegion();
		remotionBucket = (await getOrCreateBucket({region})).bucketName;
		serveUrl = convertToServeUrl({
			urlOrId: siteName,
			bucketName: remotionBucket,
		});
	}

	let composition: string = args[1];
	if (!composition) {
		Log.info(
			`No compositions passed. Fetching compositions for ${serveUrl}...`
		);

		validateServeUrl(serveUrl);
		const comps = await getCompositions(serveUrl);
		const {compositionId} = await CliInternals.selectComposition(comps);
		composition = compositionId;
	}

	const outName = parsedCloudrunCli['out-name'];
	const downloadName = args[2] ?? null;

	const privacy = parsedCloudrunCli.privacy ?? DEFAULT_OUTPUT_PRIVACY;
	validatePrivacy(privacy);

	let outputBucket = parsedCloudrunCli['output-bucket'];
	if (!outputBucket) {
		if (!remotionBucket) {
			remotionBucket = (await getOrCreateBucket({region})).bucketName;
		}

		outputBucket = remotionBucket;
	}

	let cloudRunUrl = parsedCloudrunCli['cloud-run-url'];
	let serviceName = parsedCloudrunCli['service-name'];
	if (cloudRunUrl && serviceName) {
		Log.error(
			'Both a Cloud Run URL and a Service Name was provided. Specify only one.'
		);
		quit(1);
	}

	if (!cloudRunUrl && !serviceName) {
		const services = await getServices({region, compatibleOnly: true});
		if (services.length === 0) {
			// TODO: Log if there is an incompatible service
			Log.error('No compatible services found. Please create a service first:');
			Log.info();
			Log.info(
				`  ${BINARY_NAME} ${SERVICES_COMMAND} ${CLOUD_RUN_DEPLOY_SUBCOMMAND}`
			);
			quit(1);
		}

		serviceName = services[0].serviceName;
		cloudRunUrl = services[0].uri;
	}

	if (serviceName && !cloudRunUrl) {
		const {uri} = await getServiceInfo({serviceName, region});
		cloudRunUrl = uri;
	}

	return {
		serveUrl,
		cloudRunUrl,
		composition,
		outName,
		outputBucket,
		privacy,
		downloadName,
	};
};