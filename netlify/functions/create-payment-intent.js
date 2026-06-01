const Stripe = require('stripe');

const productCatalog = {
  bundle: {
    name: 'Complete Business Asset Bundle',
    amount: 9700
  },
  helper: {
    name: 'AI Business Helper Toolkit',
    amount: 29700
  },
  email: {
    name: 'Email Marketing System',
    amount: 19700
  },
  datahunt: {
    name: 'DataHunt Lead Research System',
    amount: 29700
  },
  websiteVoice: {
    name: 'Business Launch Website Template',
    amount: 4700
  },
  blueprint: {
    name: 'Complete Business Asset Bundle',
    amount: 9700
  }
};

function stripePublicError(error) {
  const message = (error && error.message) || '';
  const lower = message.toLowerCase();

  if (lower.includes('similar object exists in test mode') || lower.includes('no such')) {
    return 'Payment could not be started. Please refresh and try again.';
  }

  if (error && error.type === 'StripeCardError') {
    return 'Sorry, payment did not go through. Please try again or try another payment method.';
  }

  return message || 'Payment could not be started.';
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
    let customerId = '';

    if (payload.customerId && /^cus_/.test(payload.customerId)) {
      try {
        const customer = await stripe.customers.retrieve(payload.customerId);
        if (!customer.deleted) customerId = customer.id;
      } catch (error) {}
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: payload.email || undefined,
        metadata: {
          checkoutSessionId: payload.checkoutSessionId || ''
        }
      });
      customerId = customer.id;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: 'usd',
      customer: customerId,
      payment_method_types: ['card'],
      setup_future_usage: 'off_session',
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
        customerId,
        productName: product.name
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({error: stripePublicError(error)})
    };
  }
};
