const Axios = require('axios');

const withParams = (params, uri) => {
  const rawUrl = Object.keys(params).reduce((acc, key, i, keys) => {
    if (params.hasOwnProperty(key) === null) {
      return acc;
    }
    return acc += i === 0
      ? `${key}=${params[key]}`
      : `&${key}=${params[key]}`;
  }, `${uri}?`);

  return encodeURI(rawUrl);
};

exports.handler = async function (context, event, callback) {
  const ProxyServiceEndpoint = `https://webhooks.twilio.com/v1/Accounts/${context.ACCOUNT_SID}/Proxy/${context.PROXY_SERVICE_SID}/Webhooks/Message`;
  const TokenEndpoint = `https://${context.RUNTIME_DOMAIN}/sync/sync-token`;
  const response = new Twilio.Response();
  // get configured twilio client
  const client = context.getTwilioClient();
  try {
    const {token} = await Axios.get(withParams({Identifier: `sms_${event.From}`}, TokenEndpoint));

    const syncClient = new Twilio.Sync.Client(token);

    // Open a Document by unique name and update its value
    syncClient.document(event.From)
      .then(async function (document) {
        // Listen to updates on the Document
        if (!document.transactionLocked) {

          // send to Proxy and quit

          const result = Axios.get({
            method: 'GET',
            url: withParams(event)
          });

          response.setBody(result);
          response.setHeaders({'Content-Type': 'application/json'});
          response.setStatusCode(200);
          return callback(null, response);
        }

        document.on('updated', async function (event) {
          if (!event.transactionLocked) {
            return;
          }

          // Send to Proxy and quit
          const result = await Axios.get(withParams(event, ProxyServiceEndpoint));

          response.setBody(result);
          response.setStatusCode(200);
          return callback(null, response);
        });

        // Update the Document value
        const newValue = {transactionLocked: true};
        return document.set(newValue);
      })
      .then(function (updateResult) {
        console.log('The Document was successfully updated', updateResult)
      })
  } catch(error) {

    console.error('Unexpected error', error);
    response.setHeaders({});
    response.setStatusCode(500);
    return callback(null, response);
  }
};
