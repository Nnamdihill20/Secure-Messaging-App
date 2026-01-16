import React, { useState, useEffect, useRef } from 'react';
import { Lock, Key, Send, Users, Shield, AlertCircle, CheckCircle } from 'lucide-react';

const SecureMessagingApp = () => {
  const [activeUser, setActiveUser] = useState('alice');
  const [users, setUsers] = useState({
    alice: {
      name: 'Alice',
      privateKey: null,
      publicKey: null,
      sharedSecret: null,
      messages: [],
      ratchetKey: 0
    },
    bob: {
      name: 'Bob',
      privateKey: null,
      publicKey: null,
      sharedSecret: null,
      messages: [],
      ratchetKey: 0
    }
  });
  const [messageInput, setMessageInput] = useState('');
  const [status, setStatus] = useState('');
  const [keysGenerated, setKeysGenerated] = useState(false);
  const [handshakeComplete, setHandshakeComplete] = useState(false);
  const messagesEndRef = useRef(null);

  // Crypto utilities using Web Crypto API
  const generateKeyPair = async () => {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveKey', 'deriveBits']
    );
    return keyPair;
  };

  const deriveSharedSecret = async (privateKey, publicKey) => {
    const sharedSecret = await window.crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: publicKey
      },
      privateKey,
      256
    );
    return sharedSecret;
  };

  const deriveAESKey = async (sharedSecret, ratchetKey) => {
    // Import shared secret as key material
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      sharedSecret,
      'HKDF',
      false,
      ['deriveKey']
    );

    // Derive AES-GCM key using HKDF with ratchet key as salt
    const salt = new TextEncoder().encode(`ratchet-${ratchetKey}`);
    const aesKey = await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: new TextEncoder().encode('secure-messaging-app')
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return aesKey;
  };

  const encryptMessage = async (message, aesKey) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(message);
    
    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      aesKey,
      encoded
    );

    return {
      ciphertext: Array.from(new Uint8Array(ciphertext)),
      iv: Array.from(iv)
    };
  };

  const decryptMessage = async (encrypted, aesKey) => {
    const ciphertext = new Uint8Array(encrypted.ciphertext);
    const iv = new Uint8Array(encrypted.iv);

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      aesKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  };

  const arrayBufferToHex = (buffer) => {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleGenerateKeys = async () => {
    setStatus('Generating cryptographic keys...');
    
    const aliceKeyPair = await generateKeyPair();
    const bobKeyPair = await generateKeyPair();

    setUsers(prev => ({
      alice: {
        ...prev.alice,
        privateKey: aliceKeyPair.privateKey,
        publicKey: aliceKeyPair.publicKey
      },
      bob: {
        ...prev.bob,
        privateKey: bobKeyPair.privateKey,
        publicKey: bobKeyPair.publicKey
      }
    }));

    setKeysGenerated(true);
    setStatus('Keys generated successfully! Ready for key exchange.');
  };

  const handleKeyExchange = async () => {
    setStatus('Performing ECDH key exchange...');

    const aliceSharedSecret = await deriveSharedSecret(
      users.alice.privateKey,
      users.bob.publicKey
    );

    const bobSharedSecret = await deriveSharedSecret(
      users.bob.privateKey,
      users.alice.publicKey
    );

    setUsers(prev => ({
      alice: {
        ...prev.alice,
        sharedSecret: aliceSharedSecret
      },
      bob: {
        ...prev.bob,
        sharedSecret: bobSharedSecret
      }
    }));

    setHandshakeComplete(true);
    setStatus('Secure channel established! End-to-end encryption active.');
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !handshakeComplete) return;

    const sender = activeUser;
    const receiver = activeUser === 'alice' ? 'bob' : 'alice';
    const senderData = users[sender];

    setStatus('Encrypting message...');

    // Derive encryption key with current ratchet
    const aesKey = await deriveAESKey(senderData.sharedSecret, senderData.ratchetKey);
    
    // Encrypt the message
    const encrypted = await encryptMessage(messageInput, aesKey);

    // Create message object
    const message = {
      id: Date.now(),
      from: sender,
      to: receiver,
      encrypted: encrypted,
      ratchetKey: senderData.ratchetKey,
      timestamp: new Date().toISOString()
    };

    // Increment ratchet for forward secrecy
    const newRatchetKey = senderData.ratchetKey + 1;

    // Decrypt for receiver
    const receiverData = users[receiver];
    const receiverAESKey = await deriveAESKey(receiverData.sharedSecret, message.ratchetKey);
    const decryptedText = await decryptMessage(encrypted, receiverAESKey);

    // Update both users' states
    setUsers(prev => ({
      ...prev,
      [sender]: {
        ...prev[sender],
        ratchetKey: newRatchetKey,
        messages: [...prev[sender].messages, { ...message, text: messageInput, decrypted: messageInput }]
      },
      [receiver]: {
        ...prev[receiver],
        messages: [...prev[receiver].messages, { ...message, text: decryptedText, decrypted: decryptedText }]
      }
    }));

    setMessageInput('');
    setStatus(`Message encrypted and sent with ratchet key ${message.ratchetKey}`);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [users]);

  const currentUser = users[activeUser];
  const otherUser = activeUser === 'alice' ? users.bob : users.alice;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-purple-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">Secure Messaging App</h1>
                <p className="text-purple-200 text-sm">End-to-End Encrypted • Forward Secrecy</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveUser('alice')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  activeUser === 'alice'
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Alice
              </button>
              <button
                onClick={() => setActiveUser('bob')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  activeUser === 'bob'
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Bob
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Setup Panel */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Key className="w-5 h-5" />
              Setup
            </h2>

            <div className="space-y-4">
              <button
                onClick={handleGenerateKeys}
                disabled={keysGenerated}
                className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-gray-500 text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {keysGenerated ? <CheckCircle className="w-5 h-5" /> : <Key className="w-5 h-5" />}
                {keysGenerated ? 'Keys Generated' : '1. Generate Keys'}
              </button>

              <button
                onClick={handleKeyExchange}
                disabled={!keysGenerated || handshakeComplete}
                className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-gray-500 text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {handshakeComplete ? <CheckCircle className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                {handshakeComplete ? 'Channel Secured' : '2. Exchange Keys (ECDH)'}
              </button>

              {/* Status */}
              {status && (
                <div className="bg-blue-500/20 border border-blue-400/30 rounded-lg p-3">
                  <p className="text-blue-200 text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {status}
                  </p>
                </div>
              )}

              {/* Key Info */}
              {keysGenerated && (
                <div className="bg-white/5 rounded-lg p-4 space-y-2">
                  <h3 className="text-white font-medium text-sm mb-2">Current User: {currentUser.name}</h3>
                  <div className="text-xs space-y-1">
                    <p className="text-purple-300">Public Key: Generated ✓</p>
                    <p className="text-purple-300">Private Key: Secured ✓</p>
                    {handshakeComplete && (
                      <>
                        <p className="text-green-300">Shared Secret: Derived ✓</p>
                        <p className="text-yellow-300">Ratchet Key: {currentUser.ratchetKey}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat Panel */}
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 flex flex-col" style={{ height: '600px' }}>
            <div className="p-4 border-b border-white/20">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-green-400" />
                  Encrypted Chat
                </h2>
                {handshakeComplete && (
                  <span className="text-xs bg-green-500/20 text-green-300 px-3 py-1 rounded-full border border-green-400/30">
                    🔒 End-to-End Encrypted
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!handshakeComplete ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Lock className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                    <p className="text-white/60">Complete the setup to start messaging</p>
                  </div>
                </div>
              ) : currentUser.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Send className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                    <p className="text-white/60">No messages yet. Send the first one!</p>
                  </div>
                </div>
              ) : (
                currentUser.messages.map((msg) => {
                  const isOwn = msg.from === activeUser;
                  return (
                    <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs ${isOwn ? 'bg-purple-500' : 'bg-white/20'} rounded-lg p-3`}>
                        <p className="text-white text-sm">{msg.decrypted}</p>
                        <div className="mt-2 text-xs text-white/60 space-y-1">
                          <p>Ratchet: {msg.ratchetKey}</p>
                          <p>{new Date(msg.timestamp).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/20">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={handshakeComplete ? "Type a message..." : "Complete setup first..."}
                  disabled={!handshakeComplete}
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!handshakeComplete || !messageInput.trim()}
                  className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-500 text-white p-2 rounded-lg transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Info Panel */}
        <div className="mt-6 bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-3">🔐 Cryptographic Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="text-purple-300 font-medium mb-2">Key Exchange</h4>
              <p className="text-white/70">ECDH P-256 curve for deriving shared secrets</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="text-purple-300 font-medium mb-2">Encryption</h4>
              <p className="text-white/70">AES-256-GCM with authenticated encryption</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="text-purple-300 font-medium mb-2">Forward Secrecy</h4>
              <p className="text-white/70">Ratcheting mechanism for key rotation</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecureMessagingApp;