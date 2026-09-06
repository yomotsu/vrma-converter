const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { NodeIO } = require('@gltf-transform/core');
const { quantize, textureCompress } = require('@gltf-transform/functions');
const { EXTTextureWebP, KHRMeshQuantization } = require('@gltf-transform/extensions');

const rootDir = path.resolve(__dirname, '..');
const inputPath = path.join(rootDir, 'generated/10kPoly_揺れものあり_VRM1.0_頭部15k_体スカート保持.vrm');
const outputPath = path.join(rootDir, 'generated/10kPoly_揺れものあり_VRM1.0_頭部15k_体スカート保持_KHR量子化_WebP80_512.vrm');
const JSON_CHUNK = 0x4e4f534a;

function parseGlb(data) {
	if (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2) throw new Error('Not a GLB v2 file.');
	const chunks = [];
	let offset = 12;
	while (offset + 8 <= data.length) {
		const length = data.readUInt32LE(offset);
		const type = data.readUInt32LE(offset + 4);
		chunks.push({ type, bytes: data.subarray(offset + 8, offset + 8 + length) });
		offset += 8 + length;
	}
	const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
	if (!jsonChunk) throw new Error('GLB JSON chunk missing.');
	return { json: JSON.parse(jsonChunk.bytes.toString('utf8').trim()), chunks };
}

function packGlb(json, chunks) {
	const jsonBytes = Buffer.from(JSON.stringify(json));
	const jsonLength = (jsonBytes.length + 3) & ~3;
	const nonJsonChunks = chunks.filter((chunk) => chunk.type !== JSON_CHUNK);
	const totalLength = 12 + 8 + jsonLength + nonJsonChunks.reduce((sum, chunk) => sum + 8 + chunk.bytes.length, 0);
	const output = Buffer.alloc(totalLength);
	output.write('glTF', 0, 4, 'ascii');
	output.writeUInt32LE(2, 4);
	output.writeUInt32LE(totalLength, 8);
	let offset = 12;
	output.writeUInt32LE(jsonLength, offset);
	output.writeUInt32LE(JSON_CHUNK, offset + 4);
	jsonBytes.copy(output, offset + 8);
	output.fill(0x20, offset + 8 + jsonBytes.length, offset + 8 + jsonLength);
	offset += 8 + jsonLength;
	for (const chunk of nonJsonChunks) {
		output.writeUInt32LE(chunk.bytes.length, offset);
		output.writeUInt32LE(chunk.type, offset + 4);
		chunk.bytes.copy(output, offset + 8);
		offset += 8 + chunk.bytes.length;
	}
	return output;
}

function restoreVrmMetadata(original, transformed) {
	transformed.asset = original.asset;
	if (original.extras !== undefined) transformed.extras = original.extras;
	if (original.extensions) transformed.extensions = original.extensions;
	transformed.extensionsUsed = [...new Set([...(transformed.extensionsUsed || []), ...(original.extensionsUsed || [])])];
	if (original.extensionsRequired || transformed.extensionsRequired) {
		transformed.extensionsRequired = [...new Set([
			...(transformed.extensionsRequired || []),
			...(original.extensionsRequired || []),
		])];
	}

	for (const key of ['scenes', 'nodes', 'meshes', 'materials', 'textures', 'images', 'samplers', 'skins', 'animations']) {
		if (!original[key] || !transformed[key]) continue;
		if (original[key].length !== transformed[key].length) {
			throw new Error(`${key} count changed (${original[key].length} -> ${transformed[key].length}).`);
		}
		for (let i = 0; i < original[key].length; i++) {
			if (original[key][i]?.extensions) transformed[key][i].extensions = {
				...(transformed[key][i].extensions || {}),
				...original[key][i].extensions,
			};
			if (original[key][i]?.extras !== undefined) transformed[key][i].extras = original[key][i].extras;
		}
	}
	for (let i = 0; i < original.nodes.length; i++) {
		if (original.nodes[i]?.name !== transformed.nodes[i]?.name) throw new Error(`Node order changed at ${i}.`);
	}
}

function getScenePositionQuantizationScale(document) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	const tmpMin = [];
	const tmpMax = [];
	let hasRelativePositions = false;

	for (const mesh of document.getRoot().listMeshes()) {
		for (const primitive of mesh.listPrimitives()) {
			const position = primitive.getAttribute('POSITION');
			if (position) {
				position.getMinNormalized(tmpMin);
				position.getMaxNormalized(tmpMax);
				for (let i = 0; i < 3; i++) {
					min[i] = Math.min(min[i], tmpMin[i]);
					max[i] = Math.max(max[i], tmpMax[i]);
				}
			}

			for (const target of primitive.listTargets()) {
				const relative = target.getAttribute('POSITION');
				if (!relative) continue;
				hasRelativePositions = true;
				relative.getMinNormalized(tmpMin);
				relative.getMaxNormalized(tmpMax);
				for (let i = 0; i < 3; i++) {
					min[i] = Math.min(min[i], tmpMin[i], tmpMin[i] * 2, 0);
					max[i] = Math.max(max[i], tmpMax[i], tmpMax[i] * 2, 0);
				}
			}
		}
	}

	if (!hasRelativePositions) throw new Error('No morph target positions found.');
	return Math.max(...min.map((value, i) => (max[i] - value) / 2));
}

(async () => {
	const original = parseGlb(fs.readFileSync(inputPath));
	const io = new NodeIO().registerExtensions([KHRMeshQuantization, EXTTextureWebP]);
	const document = await io.read(inputPath);
	const sourceFaceMesh = document.getRoot().listMeshes().find((mesh) => mesh.getName().startsWith('Face'));
	if (!sourceFaceMesh) throw new Error('Face mesh not found.');
	const sourceFaceMorphs = [];
	for (const primitive of sourceFaceMesh.listPrimitives()) {
		for (const target of primitive.listTargets()) {
			const position = target.getAttribute('POSITION');
			if (!position?.getArray()) throw new Error('Face morph target POSITION data missing.');
			sourceFaceMorphs.push(new Float32Array(position.getArray()));
		}
	}
	const positionScale = getScenePositionQuantizationScale(document);

	await document.transform(
		quantize({
			quantizationVolume: 'scene',
			quantizePosition: 14,
			quantizeNormal: 10,
			quantizeTexcoord: 12,
			quantizeWeight: 8,
		}),
		textureCompress({
			encoder: sharp,
			targetFormat: 'webp',
			// Do not recompress an input WebP. PNG/JPEG inputs are converted once.
			formats: /^image\/(?:png|jpeg)$/,
			resize: [512, 512],
			quality: 80,
		}),
	);

	// Expression morph targets are mostly zero-valued. Sparse accessors preserve
	// every quantized value while avoiding storage for unchanged vertices.
	const faceMesh = document.getRoot().listMeshes().find((mesh) => mesh.getName().startsWith('Face'));
	if (!faceMesh) throw new Error('Face mesh not found.');
	let morphIndex = 0;
	for (const primitive of faceMesh.listPrimitives()) {
		for (const target of primitive.listTargets()) {
			const position = target.getAttribute('POSITION');
			if (!position) continue;
			// three.js copies morph attributes into a Float32 morph texture and does
			// not apply BufferAttribute.normalized there. Restore the original face
			// displacement in the quantized coordinate system as Float32, while
			// retaining sparse storage for size.
			const sourceValues = sourceFaceMorphs[morphIndex++];
			if (!sourceValues) throw new Error('Face morph target count changed.');
			const values = new Float32Array(sourceValues.length);
			for (let i = 0; i < sourceValues.length; i++) values[i] = sourceValues[i] / positionScale;
			position.setArray(values).setNormalized(false).setSparse(true);
		}
	}
	if (morphIndex !== sourceFaceMorphs.length) throw new Error('Face morph target count changed.');

	const texture = document.getRoot().listTextures()[0];
	texture.setName(texture.getName().replace(/\.(png|jpe?g|webp)$/i, '.webp'));
	const imageMetadata = await sharp(texture.getImage()).metadata();
	if (texture.getMimeType() !== 'image/webp') throw new Error(`Texture conversion failed: ${texture.getMimeType()}`);
	if (imageMetadata.width > 512 || imageMetadata.height > 512) {
		throw new Error(`Texture resize failed: ${imageMetadata.width}x${imageMetadata.height}`);
	}

	const bareGlb = Buffer.from(await io.writeBinary(document));
	const transformed = parseGlb(bareGlb);
	restoreVrmMetadata(original.json, transformed.json);
	fs.writeFileSync(outputPath, packGlb(transformed.json, transformed.chunks));

	const meshStats = transformed.json.meshes.map((mesh) => mesh.primitives.map((primitive) => ({
		name: mesh.name,
		vertices: transformed.json.accessors[primitive.attributes.POSITION].count,
		triangles: transformed.json.accessors[primitive.indices].count / 3,
		morphTargets: primitive.targets?.length || 0,
	})));
	console.log(JSON.stringify({
		outputPath,
		bytes: fs.statSync(outputPath).size,
		texture: { mimeType: texture.getMimeType(), width: imageMetadata.width, height: imageMetadata.height, quality: 80 },
		morphPositionScale: positionScale,
		extensionsUsed: transformed.json.extensionsUsed,
		extensionsRequired: transformed.json.extensionsRequired,
		meshStats,
	}, null, 2));
})().catch((error) => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
