const Stripe = require('stripe');

const buckets = {
  bundle: process.env.CLOUDFLARE_R2_BUCKET_1 || 'aibundlekit',
  template: process.env.CLOUDFLARE_R2_BUCKET_2 || 'template2',
  website: process.env.CLOUDFLARE_R2_BUCKET_3 || 'websitetemplate'
};

const productCatalog = {
  bundle: {
    name: 'Full AI Business Builder Bundle',
    bucket: buckets.bundle,
    fileKey: 'Ai offer products.zip',
    fileName: 'Ai offer products.zip'
  },
  helper: {
    name: 'AI Business Helper',
    bucket: buckets.template,
    fileKey: 'AI Assistant.zip',
    fileName: 'AI Assistant.zip'
  },
  email: {
    name: 'Email Template Builder',
    bucket: buckets.website,
    fileKey: 'Email Builder.zip',
    fileName: 'Email Builder.zip'
  },
  datahunt: {
    name: 'DataHunt Market Research',
    bucket: buckets.website,
    fileKey: 'DataHunt.zip',
    fileName: 'DataHunt.zip'
  },
  websiteVoice: {
    name: 'Website Template',
    bucket: buckets.template,
    fileKey: 'Website with Voice AI.zip',
    fileName: 'Website with Voice AI.zip'
  },
  blueprint: {
    name: 'Client Acquisition Blueprint',
    bucket: buckets.bundle,
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

    return json(200, {
      downloadUrl: '/.netlify/functions/download-product',
      fileName: product.fileName,
      paymentIntentId: paymentIntent.id,
      productName: product.name
    });
  } catch (error) {
    return json(500, {error: error.message || 'Download could not be prepared.'});
  }
};
