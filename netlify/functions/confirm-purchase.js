const Stripe = require('stripe');
const {S3Client, GetObjectCommand} = require('@aws-sdk/client-s3');
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');

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

function publicStripeError(error) {
  const message = (error && error.message) || '';
  const lower = message.toLowerCase();

  if (lower.includes('no such payment_intent') || lower.includes('similar object exists in test mode')) {
    return json(400, {error: 'Payment verification failed. Please start checkout again.'});
  }

  if (error && error.type === 'StripeCardError') {
    return json(402, {error: 'Sorry, payment did not go through. Please try again or try another payment method.'});
  }

  return null;
}

function getR2Client() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || process.env.CF_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;

  const missing = [];
  if (!accountId) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');

  if (missing.length) {
    throw new Error('Missing Netlify environment variables: ' + missing.join(', ') + '. Save them, then clear cache and redeploy.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {accessKeyId, secretAccessKey}
  });
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {'Allow': 'POST'},
      body: JSON.stringify({error: 'Method not allowed'})
    };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, {error: 'Stripe secret key is not configured on Netlify.'});
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const product = productCatalog[payload.productKey];

    if (!product || !payload.paymentIntentId) {
      return json(400, {error: 'Missing product or payment confirmation.'});
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.retrieve(payload.paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return json(402, {error: 'Payment has not been confirmed yet.'});
    }

    if (paymentIntent.metadata.productKey !== payload.productKey) {
      return json(403, {error: 'Payment does not match this product.'});
    }

    if (paymentIntent.metadata.downloadIssuedAt) {
      return json(409, {error: 'This purchase download was already issued. Please complete checkout again for a new download.'});
    }

    const r2 = getR2Client();
    const command = new GetObjectCommand({
      Bucket: product.bucket,
      Key: product.fileKey,
      ResponseContentDisposition: `attachment; filename="${product.fileName.replace(/"/g, '')}"`,
      ResponseContentType: 'application/zip'
    });
    const downloadUrl = await getSignedUrl(r2, command, {expiresIn: 60});

    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        ...paymentIntent.metadata,
        downloadIssuedAt: new Date().toISOString(),
        downloadedProductKey: payload.productKey
      }
    });

    return json(200, {
      downloadUrl,
      fileName: product.fileName,
      paymentIntentId: paymentIntent.id,
      productName: product.name
    });
  } catch (error) {
    const stripeResponse = publicStripeError(error);
    if (stripeResponse) return stripeResponse;

    return json(500, {error: error.message || 'Download could not be prepared.'});
  }
};
