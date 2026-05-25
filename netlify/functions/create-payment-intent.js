const Stripe = require('stripe');

const productCatalog = {
  bundle: {
    name: 'Full AI Business Builder Bundle',
    amount: 49900
  },
  helper: {
    name: 'AI Business Helper',
    amount: 29700
  },
  email: {
    name: 'Email Template Builder',
    amount: 19700
  },
  datahunt: {
    name: 'DataHunt Market Research',
    amount: 9700
  },
  websiteVoice: {
    name: 'Website Template',
    amount: 4700
  },
  blueprint: {
    name: 'Client Acquisition Blueprint',
    amount: 9700
  }
};

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {'Allow': 'POST'},
      body: JSON.stringify({error: 'Method not allowed'})
    };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({error: 'Stripe secret key is not configured on Netlify.'})
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const product = productCatalog[payload.productKey];

    if (!product) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Invalid product selected.'})
      };
    }

    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: 'usd',
      automatic_payment_methods: {enabled: true},
      receipt_email: payload.email || undefined,
      metadata: {
        productKey: payload.productKey,
        productName: product.name,
        buyerName: payload.name || '',
        buyerEmail: payload.email || ''
      }
    });

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        productName: product.name
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({error: error.message || 'Payment could not be started.'})
    };
  }
};
