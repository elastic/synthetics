import { CDPSession } from 'playwright';
import { Protocol } from 'playwright/types/protocol';
import { NetworkInfo } from '../common_types';

export class NetworkManager {
  waterfallMap = new Map<string, NetworkInfo>();

  async start(client: CDPSession) {
    await client.send('Network.enable');
    /**
     * Listen for all network events
     */
    client.on(
      'Network.requestWillBeSent',
      this._onRequestWillBeSent.bind(this)
    );
    client.on('Network.responseReceived', this._onResponseReceived.bind(this));
    client.on('Network.loadingFinished', this._onLoadingFinished.bind(this));
    client.on('Network.loadingFailed', this._onLoadingFailed.bind(this));
  }

  _onRequestWillBeSent(event: Protocol.Network.requestWillBeSentPayload) {
    const { requestId, request, timestamp, type, loaderId } = event;
    const { url, method } = request;
    const isNavigationRequest = requestId == loaderId && type === 'Document';

    this.waterfallMap.set(requestId, {
      url,
      request,
      type,
      method,
      start: timestamp,
      isNavigationRequest,
      status: 0,
      end: 0,
      response: null
    });
  }

  _onResponseReceived(event: Protocol.Network.responseReceivedPayload) {
    const { requestId, response } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    Object.assign(record, {
      status: response.status,
      response
    });
    /**
     * Enhance request headers with additional information
     */
    if (response.requestHeaders) {
      record.request.headers = {
        ...record.request.headers,
        ...response.requestHeaders
      };
    }
  }

  _onLoadingFinished(event: Protocol.Network.loadingFinishedPayload) {
    const { requestId, timestamp } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    record.end = timestamp;
  }

  _onLoadingFailed(event: Protocol.Network.loadingFailedPayload) {
    const { requestId, timestamp } = event;
    const record = this.waterfallMap.get(requestId);
    if (!record) {
      return;
    }
    record.end = timestamp;
  }

  stop() {
    return [...this.waterfallMap.values()];
  }
}
