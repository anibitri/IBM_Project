import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useHistory } from '../context/HistoryContext';

export default function ChatScreen({ route, navigation }) {
  // Replace direct destructure so we can try optional context methods later
  const historyCtx = useHistory();
  const { history } = historyCtx;
  const docId = route?.params?.docId;
  const selected = Array.isArray(history) ? history.find((item) => item?.id === docId) : undefined;

  // Menu-like modal for switching conversations
  const [historyVisible, setHistoryVisible] = React.useState(false);
  const openHistory = () => setHistoryVisible(true);
  const closeHistory = () => setHistoryVisible(false);
  const handleSelect = (item) => {
    navigation.setParams({ docId: item?.id });
    closeHistory();
  };

  // Chat state: per-doc threads and input
  const [messagesByDoc, setMessagesByDoc] = React.useState({});
  const [inputText, setInputText] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const docKey = docId ?? 'global';
  const messages = messagesByDoc[docKey] ?? [];

  const appendMessage = (key, msg) =>
    setMessagesByDoc((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg] }));

  // Try calling a context method if present (no-op if not provided)
  const tryCall = (fn, ...args) => {
    if (typeof fn === 'function') {
      try { return fn(...args); } catch (_) {}
    }
    return undefined;
  };

  // Create a new conversation and try to add it to history if the context supports it
  const createNewConversation = (nameHint) => {
    const id = `chat-${Date.now()}`;
    const item = {
      id,
      name: nameHint || 'New chat',
      type: 'chat',
      createdAt: Date.now(),
      // Optional fields some contexts might store:
      // messages: [],
      // attachments: [],
      // lastActivityAt: Date.now(),
    };
    // Try a few common method names; ignore if none exist
    tryCall(historyCtx?.addHistoryItem, item)
      ?? tryCall(historyCtx?.addHistory, item)
      ?? tryCall(historyCtx?.add, item)
      ?? tryCall(historyCtx?.upsertHistoryItem, item)
      ?? tryCall(historyCtx?.upsert, item);
    navigation.setParams({ docId: id });
    return id;
  };

  // Ensure we have a conversation id; create one if not
  const ensureConversationId = (nameHint) => {
    if (docId) return docId;
    const newId = createNewConversation(nameHint);
    return newId;
  };

  // Placeholder reply (replace with backend call later)
  const mockReply = async (userMsg, context) => {
    await new Promise((r) => setTimeout(r, 600));
    const ctx = context?.name ? ` about "${context.name}"` : '';
    return `Acknowledged${ctx}. You said: "${userMsg.text}". This is a placeholder response.`;
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    // Ensure this message belongs to a concrete conversation (not the 'global' key)
    const useId = ensureConversationId();

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text, createdAt: Date.now() };
    appendMessage(useId, userMsg);
    setInputText('');
    setSending(true);

    // Try to update lastActivity if supported by context
    tryCall(historyCtx?.updateHistoryItem, useId, { lastActivityAt: Date.now() })
      ?? tryCall(historyCtx?.update, useId, { lastActivityAt: Date.now() });

    try {
      const current = Array.isArray(history) ? history.find((h) => h?.id === useId) : undefined;
      const replyText = await mockReply(userMsg, current);
      const botMsg = { id: `a-${Date.now()}`, role: 'assistant', text: replyText, createdAt: Date.now() };
      appendMessage(useId, botMsg);
      tryCall(historyCtx?.updateHistoryItem, useId, { lastActivityAt: Date.now() })
        ?? tryCall(historyCtx?.update, useId, { lastActivityAt: Date.now() });
    } finally {
      setSending(false);
    }
  };

  // Trigger Upload/Scan from the chat, associated with the current conversation
  const handleUploadFromChat = () => {
    const useId = ensureConversationId('Untitled chat');
    navigation.navigate('Upload', { docId: useId });
  };
  const handleScanFromChat = () => {
    const useId = ensureConversationId('Untitled chat');
    navigation.navigate('Scan', { docId: useId });
  };

  // Ref for auto-scrolling the message list
  const scrollRef = React.useRef(null);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      {/* History menu button */}
      <View style={styles.menuWrapper}>
        <TouchableOpacity style={styles.historyButton} onPress={openHistory}>
          <Text style={styles.historyButtonText}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Messages list (replaced FlatList with ScrollView) */}
      <ScrollView
        ref={scrollRef}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        <View style={{ marginBottom: 8 }}>
          {selected ? (
            <Text style={styles.contextText}>Chatting about: {selected.name}</Text>
          ) : (
            <Text style={styles.contextText}>No document selected.</Text>
          )}
        </View>

        {messages.map((item) => {
          const isUser = item.role === 'user';
          return (
            <View key={String(item.id)} style={[styles.msgRow, isUser ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
              <View style={[styles.msgBubble, isUser ? styles.msgUser : styles.msgAssistant]}>
                <Text style={[styles.msgText, isUser ? { color: '#fff' } : null]}>{item.text}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input bar with Upload/Scan actions */}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.actionButton} onPress={handleUploadFromChat}>
          <Text style={styles.actionButtonText}>Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleScanFromChat}>
          <Text style={styles.actionButtonText}>Scan</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Type a message"
          value={inputText}
          onChangeText={setInputText}
          editable={!sending}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (sending || !inputText.trim()) && { opacity: 0.6 }]}
          disabled={sending || !inputText.trim()}
          onPress={handleSend}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>Send</Text>}
        </TouchableOpacity>
      </View>

      {/* History picker modal */}
      <Modal
        visible={historyVisible}
        animationType="fade"
        transparent
        onRequestClose={closeHistory}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Switch conversation</Text>

            {(Array.isArray(history) ? history : []).map((item, index) => {
              const key = item?.id != null ? String(item.id) : `row-${index}`;
              const active = item?.id === docId;
              return (
                <TouchableOpacity key={key} style={styles.modalItem} onPress={() => handleSelect(item)}>
                  <Text style={{ fontWeight: active ? '700' : '500' }}>
                    {item?.name ?? 'Untitled'}
                  </Text>
                  {item?.createdAt ? (
                    <Text style={{ color: '#6c757d', fontSize: 12 }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}

            {/* New chat action */}
            <TouchableOpacity
              style={[styles.modalClose, { alignSelf: 'flex-start', backgroundColor: '#e7f0ff' }]}
              onPress={() => {
                const id = createNewConversation('New chat');
                // Optional: pre-create an empty thread
                setMessagesByDoc((prev) => ({ ...prev, [id]: prev[id] ?? [] }));
                closeHistory();
              }}
            >
              <Text style={{ color: '#007AFF', fontWeight: '600' }}>New chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalClose} onPress={closeHistory}>
              <Text>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  text: { fontSize: 18 },
  messagesList: { flex: 1 },
  messagesContent: { paddingHorizontal: 16, paddingTop: 72, paddingBottom: 12 },
  contextText: { color: '#6c757d', fontSize: 12 },
  msgRow: { flexDirection: 'row', marginVertical: 6 },
  msgBubble: {
    maxWidth: '80%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  msgUser: { backgroundColor: '#007AFF', borderTopRightRadius: 4 },
  msgAssistant: { backgroundColor: '#E9ECEF', borderTopLeftRadius: 4 },
  msgText: { fontSize: 15, color: '#1c1c1e' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e9ecef',
    backgroundColor: '#fff',
  },
  actionButton: {
    backgroundColor: '#f1f3f5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 6,
  },
  actionButtonText: { color: '#1c1c1e', fontWeight: '600', fontSize: 12 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 68,
  },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  // New styles
  menuWrapper: {
    position: 'absolute',
    top: 55,
    left: 15,
    zIndex: 10,
  },
  historyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  historyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e9ecef',
  },
  modalClose: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f1f3f5',
  },
});
