const Stripe = require('stripe');
const {S3Client, GetObjectCommand} = require('@aws-sdk/client-s3');

const buckets = {
  template: process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET_2 || 'template2',
  website: process.env.R2_BUCKET2 || process.env.CLOUDFLARE_R2_BUCKET_3 || 'websitetemplate',
  bundle: process.env.R2_BUCKET3 || process.env.CLOUDFLARE_R2_BUCKET_1 || 'aibundlekit'
};

const fileKeys = {
  bundle: process.env.R2_FILE_KEY_BUNDLE || 'Ai offer products.zip',
  helper: process.env.R2_FILE_KEY_AI_ASSISTANT || 'AI Assistant.zip',
  email: process.env.R2_FILE_KEY_EMAIL_BUILDER || 'Email Builder.zip',
  datahunt: process.env.R2_FILE_KEY_DATAHUNT || 'DataHunt.zip',
  websiteVoice: process.env.R2_FILE_KEY_WEBSITE_VOICE || 'Website with Voice AI.zip'
};

const productCatalog = {
  bundle: {
    name: 'Full AI Business Builder Bundle',
    bucket: buckets.bundle,
    fileKey: fileKeys.bundle,
    fileName: fileKeys.bundle
  },
  helper: {
    name: 'AI Business Helper',
    bucket: buckets.template,
    fileKey: fileKeys.helper,
    fileName: fileKeys.helper
  },
  email: {
    name: 'Email Template Builder',
    bucket: buckets.website,
    fileKey: fileKeys.email,
    fileName: fileKeys.email
  },
  datahunt: {
    name: 'DataHunt Market Research',
    bucket: buckets.website,
    fileKey: fileKeys.datahunt,
    fileName: fileKeys.datahunt
  },
  websiteVoice: {
    name: 'Website Template',
    bucket: buckets.template,
    fileKey: fileKeys.websiteVoice,
    fileName: fileKeys.websiteVoice
  },
  blueprint: {
    name: 'Client Acquisition Blueprint',
    bucket: buckets.bundle,
    fileKey: fileKeys.bundle,
    fileName: fileKeys.bundle
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  };
}

function getR2Client() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || process.env.CF_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;

  const missing = [];
  if (!accountId) missing.push('CLOUDFLARE_R2_ACCOUNT_ID or R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID or R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY');

  if (missing.length) {
    throw new Error('Missing Netlify environment variables: ' + missing.join(', ') + '. Save them, then trigger a new deploy.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {accessKeyId, secretAccessKey}
  });
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function verifyPayment(productKey, paymentIntentId) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured on Netlify.');
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status !== 'succeeded') {
    throw new Error('Payment has not been confirmed yet.');
  }

  if (paymentIntent.metadata.productKey !== productKey) {
    throw new Error('Payment does not match this product.');
  }

  if (paymentIntent.metadata.downloadIssuedAt) {
    throw new Error('This purchase download was already issued. Please complete checkout again for a new download.');
  }
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {'Allow': 'POST'},
      body: JSON.stringify({error: 'Method not allowed'})
    };
  }

  return json(410, {error: 'Direct product downloads are disabled. Please complete checkout to receive a fresh download link.'});

  try {
    const payload = JSON.parse(event.body || '{}');
    const product = productCatalog[payload.productKey];

    if (!product || !payload.paymentIntentId) {
      return json(400, {error: 'Missing product or payment confirmation.'});
    }

    await verifyPayment(payload.productKey, payload.paymentIntentId);

    const r2 = getR2Client();
    const object = await r2.send(new GetObjectCommand({
      Bucket: product.bucket,
      Key: product.fileKey
    }));
    const fileBuffer = await streamToBuffer(object.Body);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${product.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store'
      },
      isBase64Encoded: true,
      body: fileBuffer.toString('base64')
    };
  } catch (error) {
    return json(500, {error: error.message || 'Download could not be completed.'});
  }
};
