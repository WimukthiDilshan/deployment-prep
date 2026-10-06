const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const uploadDirectory = path.resolve(__dirname, '../../uploads');
const storageMode = String(process.env.EXAM_FILE_STORAGE || 'local').trim().toLowerCase();
const bucketName = String(process.env.EXAM_UPLOADS_BUCKET || '').trim();
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

if (!['local', 's3'].includes(storageMode)) {
  throw new Error('EXAM_FILE_STORAGE must be either "local" or "s3".');
}

if (storageMode === 's3' && !bucketName) {
  throw new Error('EXAM_UPLOADS_BUCKET is required when EXAM_FILE_STORAGE=s3.');
}

if (storageMode === 's3' && !region) {
  throw new Error('AWS_REGION is required when EXAM_FILE_STORAGE=s3.');
}

const s3Client = storageMode === 's3' ? new S3Client({ region }) : null;

function parseS3Location(filePath) {
  const location = new URL(filePath);
  const key = decodeURIComponent(location.pathname.replace(/^\//, ''));
  if (location.protocol !== 's3:' || location.hostname !== bucketName || !key || key.split('/').includes('..')) {
    throw new Error('Invalid S3 object location saved for this exam file.');
  }
  return { bucket: location.hostname, key };
}

async function storeUploadedFile(file) {
  if (storageMode === 's3') {
    const key = `exam-materials/${path.basename(file.filename)}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fs.createReadStream(file.path),
      ContentLength: file.size,
      ContentType: file.mimetype || 'application/octet-stream',
    }));
    return `s3://${bucketName}/${key}`;
  }

  const safeFileName = path.basename(file.filename);
  const localPath = path.resolve(uploadDirectory, safeFileName);
  if (!localPath.startsWith(`${uploadDirectory}${path.sep}`)) {
    throw new Error('Invalid local exam file name.');
  }
  await fsPromises.copyFile(file.path, localPath);
  return path.relative(path.resolve(__dirname, '../..'), localPath).replace(/\\/g, '/');
}

async function openStoredFile(filePath, storedFileName) {
  if (String(filePath || '').startsWith('s3://')) {
    const location = parseS3Location(filePath);
    const object = await s3Client.send(new GetObjectCommand({
      Bucket: location.bucket,
      Key: location.key,
    }));
    if (!object.Body) throw new Error('The stored S3 exam file has no response body.');
    return { stream: object.Body, contentType: object.ContentType };
  }

  const safeFileName = path.basename(storedFileName || '');
  if (!safeFileName) throw new Error('Invalid stored local exam file name.');
  const localPath = path.resolve(uploadDirectory, safeFileName);
  if (!localPath.startsWith(`${uploadDirectory}${path.sep}`)) {
    throw new Error('Invalid stored local exam file path.');
  }
  return { stream: fs.createReadStream(localPath), contentType: undefined };
}

async function deleteStoredFile(filePath, storedFileName) {
  if (String(filePath || '').startsWith('s3://')) {
    const location = parseS3Location(filePath);
    await s3Client.send(new DeleteObjectCommand({
      Bucket: location.bucket,
      Key: location.key,
    }));
    return;
  }

  const safeFileName = path.basename(storedFileName || '');
  if (!safeFileName) return;
  const localPath = path.resolve(uploadDirectory, safeFileName);
  if (localPath.startsWith(`${uploadDirectory}${path.sep}`)) {
    await fsPromises.unlink(localPath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

module.exports = { deleteStoredFile, openStoredFile, storeUploadedFile, storageMode };
