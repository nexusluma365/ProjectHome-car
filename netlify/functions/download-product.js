const Stripe = require('stripe');
const {S3Client, GetObjectCommand} = require('@aws-sdk/client-s3');

const productCatalog = {
  bundle: {
    name: 'Full AI Business Builder Bundle',
    bucket: 'aibundlekit',
    fileKey: 'Ai offer products.zip',
    fileName: 'Ai offer products.zip'
  },
  helper: {
    name: 'AI Business Helper',
    bucket: 'template2',
    fileKey: 'AI Assistant.zip',
    fileName: 'AI Assistant.zip'
  },
  email: {
    name: 'Email Template Builder',
    bucket: 'websitetemplate',
    fileKey: 'Email Builder.zip',
    fileName: 'Email Builder.zip'
  },
  datahunt: {
    name: 'DataHunt Market Research',
    bucket: 'websitetemplate',
    fileKey: 'DataHunt.zip',
    fileName: 'DataHunt.zip'
  },
  websiteVoice: {
    name: 'Website Template',
    bucket: 'template2',
    fileKey: 'Website with Voice AI.zip',
    fileName: 'Website with Voice AI.zip'
  },
  blueprint: {
    name: 'Client Acquisition Blueprint',
    bucket: 'aibundlekit',
    fileKey: 'Ai offer products.zip',
    fileName: 'Ai offer products.zip'
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
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 environment variables are not configured on Netlify.');
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
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {'Allow': 'POST'},
      body: JSON.stringify({error: 'Method not allowed'})
    };
  }

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
