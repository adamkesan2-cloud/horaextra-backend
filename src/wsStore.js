// backend/src/wsStore.js
const WebSocket = require('ws');

class WebSocketStore {
  constructor() {
    // Única fonte de verdade: todos os utilizadores ligados (clientes e
    // prestadores), preenchida diretamente pelo server.js via
    // wsStore.connectedUsers.set(...). Guarda { ws, name, role, isOnline,
    // lastHeartbeat, lat, lng }.
    this.clients = new Map();
    // Notificações para utilizadores que estavam offline/desligados no
    // momento do evento — entregues assim que voltam a ligar-se.
    this.pendingNotifications = new Map(); // userId -> [{ type, payload }]
    this.wss = null;
  }

  get connectedUsers() {
    return this.clients;
  }

  setWebSocketServer(wss) {
    this.wss = wss;
  }

  // ── Compatibilidade (mantidos para não partir chamadas antigas) ────────
  addClient(userId, ws, role, name, lat, lng, isOnline = true) {
    const clientData = { ws, role, name, lat, lng, isOnline };
    this.clients.set(userId, clientData);
    return clientData;
  }

  removeClient(userId) {
    this.clients.delete(userId);
  }

  updateLocation(userId, lat, lng) {
    const client = this.clients.get(userId);
    if (client) {
      client.lat = lat;
      client.lng = lng;
      return true;
    }
    return false;
  }

  setOnlineStatus(userId, isOnline) {
    const client = this.clients.get(userId);
    if (client) {
      client.isOnline = isOnline;
      return true;
    }
    return false;
  }

  // ── Notificações pendentes ─────────────────────────────────────────────
  queuePendingNotification(userId, type, payload) {
    if (!userId) return;
    const list = this.pendingNotifications.get(userId) || [];
    list.push({ type, payload });
    this.pendingNotifications.set(userId, list.slice(-50)); // limite de segurança
  }

  getPendingNotifications(userId) {
    return this.pendingNotifications.get(userId) || [];
  }

  clearPendingNotifications(userId) {
    this.pendingNotifications.delete(userId);
  }

  _isConnected(client) {
    return !!(client && client.ws && client.ws.readyState === WebSocket.OPEN);
  }

  _send(client, data) {
    if (this._isConnected(client)) {
      try {
        client.ws.send(JSON.stringify(data));
        return true;
      } catch (e) {
        console.error('❌ Erro ao enviar via WS:', e.message);
        return false;
      }
    }
    return false;
  }

  notifyNewRequest({ requestId, clientId, clientName, serviceName, location, selectedProviderIds, budget, isUrgent, quantity, wantedProviders }) {
    let notifiedCount = 0;

    if (selectedProviderIds && selectedProviderIds.length > 0) {
      for (const providerId of selectedProviderIds) {
        if (!providerId) continue;
        const provider = this.clients.get(providerId);
        const payload = {
          requestId,
          clientId,
          clientName,
          serviceName,
          location,
          budget,
          isUrgent: isUrgent || false,
          quantity: quantity || 1,
          wantedProviders: wantedProviders || 1,
          timestamp: new Date().toISOString(),
        };

        if (this._send(provider, { type: 'NEW_REQUEST', ...payload })) {
          notifiedCount++;
        } else {
          this.queuePendingNotification(providerId, 'NEW_REQUEST', payload);
        }
      }
    }

    return notifiedCount;
  }

  notifyRequestResponse({
    requestId,
    clientId,
    providerId,
    providerName,
    providerLat,
    providerLng,
    providerPhoto,
    accepted,
    isFull,
    acceptedCount,
    wanted,
    pricePerProvider,
    totalBudget,
    isPriceDivided,
    acceptedProviders,
    message
  }) {
    if (!clientId) {
      console.warn(`⚠️ notifyRequestResponse chamado sem clientId (pedido ${requestId})`);
      return false;
    }

    const client = this.clients.get(clientId);
    const payload = {
      requestId,
      providerId,
      providerName,
      providerLat: providerLat || -25.9692,
      providerLng: providerLng || 32.5732,
      providerPhoto: providerPhoto || '',
      accepted,
      isFull: isFull || false,
      acceptedCount: acceptedCount || 0,
      wanted: wanted || 1,
      pricePerProvider: pricePerProvider || 0,
      totalBudget: totalBudget || 0,
      isPriceDivided: isPriceDivided || false,
      acceptedProviders: acceptedProviders || [],
      message,
      timestamp: new Date().toISOString(),
    };

    const type = accepted ? 'REQUEST_ACCEPTED' : 'REQUEST_REJECTED';
    const sent = this._send(client, { type, ...payload });
    if (!sent) this.queuePendingNotification(clientId, type, payload);
    return sent;
  }

  notifySelectionFinalized({ requestId, acceptedProviders, pricePerProvider, totalBudget, providerCount, clientId }) {
    const client = this.clients.get(clientId);
    const payload = {
      requestId,
      acceptedProviders,
      pricePerProvider,
      totalBudget,
      providerCount,
      message: `Seleção finalizada com ${providerCount} prestador(es)! Valor dividido: ${pricePerProvider} MT cada.`,
      timestamp: new Date().toISOString(),
    };
    const sent = this._send(client, { type: 'SELECTION_FINALIZED', ...payload });
    if (!sent) this.queuePendingNotification(clientId, 'SELECTION_FINALIZED', payload);
    return sent;
  }

  notifyServiceStarted({ requestId, providerId, clientId, providerName }) {
    const client = this.clients.get(clientId);
    const payload = {
      requestId,
      providerId,
      providerName,
      message: `${providerName} iniciou o serviço!`,
      timestamp: new Date().toISOString(),
    };
    const sent = this._send(client, { type: 'SERVICE_STARTED', ...payload });
    if (!sent) this.queuePendingNotification(clientId, 'SERVICE_STARTED', payload);
    return sent;
  }

  notifyServiceCompleted({ requestId, clientId, clientName, providerId }) {
    const provider = this.clients.get(providerId);
    const payload = {
      requestId,
      clientId,
      clientName,
      message: `${clientName} concluiu o serviço!`,
      timestamp: new Date().toISOString(),
    };
    const sent = this._send(provider, { type: 'SERVICE_COMPLETED', ...payload });
    if (!sent) this.queuePendingNotification(providerId, 'SERVICE_COMPLETED', payload);
    return sent;
  }

  broadcastProviderLocation(providerId, lat, lng) {
    const provider = this.clients.get(providerId);
    if (!provider) return;

    for (const [, client] of this.clients) {
      if (client.role === 'client' && this._isConnected(client)) {
        this._send(client, {
          type: 'provider_location',
          providerId,
          lat,
          lng,
          providerName: provider.name,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  getOnlineProviders() {
    const online = [];
    for (const [id, client] of this.clients) {
      if (client.role === 'provider' && client.isOnline && this._isConnected(client)) {
        online.push({ id, name: client.name, lat: client.lat, lng: client.lng });
      }
    }
    return online;
  }

  getProviderStats(providerId) {
    const provider = this.clients.get(providerId);
    if (!provider || provider.role !== 'provider') return null;
    return { isOnline: !!provider.isOnline };
  }

  broadcastToProviders(data) {
    let count = 0;
    for (const [, client] of this.clients) {
      if (client.role === 'provider' && client.isOnline && this._send(client, data)) {
        count++;
      }
    }
    return count;
  }

  sendProvidersSnapshot(clientId) {
    const client = this.clients.get(clientId);
    if (!this._isConnected(client)) return;
    this._send(client, {
      type: 'providers_snapshot',
      providers: this.getOnlineProviders(),
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = new WebSocketStore();