import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, 
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, SafeAreaView, Alert, TouchableWithoutFeedback 
} from 'react-native';
import { useHistory } from '../context/HistoryContext';

// 🛑 IMPORTANT: Do NOT put 'async' here. It must be a standard function.
export default function ChatScreen({ route, navigation }) {
  
  // --- 1. ALWAYS CALL HOOKS FIRST (To prevent "Should have a queue" error) ---
  
  const { history, addHistoryItem, addMessageToItem, updateHistoryItem } = useHistory();
  
  // Local State
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  
  const scrollRef = useRef(null);

  // --- 2. CALCULATE VARIABLES AFTER HOOKS ---

  const routeDocId = route?.params?.docId;
  // Safety check: Make sure history is an array before using .find()
  const safeHistory = Array.isArray(history) ? history : [];
  
  const activeItem = safeHistory.find((item) => item.id === routeDocId) || safeHistory[0];
  const activeId = activeItem?.id;

  // --- 3. EFFECTS ---

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [activeItem?.messages, activeId]);

  // --- 4. ACTIONS ---

  const createNewSession = (type = 'chat', name = 'New Chat') => {
    const newId = `session-${Date.now()}`;
    addHistoryItem({
      id: newId,
      name: name,
      type: type,
      messages: [],
    });
    navigation.setParams({ docId: newId });
    setHistoryVisible(false);
    return newId;
  };

  const handleActionRequest = (actionType) => {
    setMenuVisible(false); 
    
    Alert.alert(
      `Start New ${actionType}?`,
      `This will create a new chat session for your ${actionType.toLowerCase()}ed item.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Continue", 
          onPress: () => {
            const newId = createNewSession(actionType.toLowerCase(), `New ${actionType}...`);
            if(actionType === 'Upload') navigation.navigate('Upload', { docId: newId });
            if(actionType === 'Scan') navigation.navigate('Scan', { docId: newId });
          }
        }
      ]
    );
  };

  const switchConversation = (item) => {
    navigation.setParams({ docId: item.id });
    setHistoryVisible(false);
  };

  // Rename Logic
  const handleStartRename = () => {
    if (!activeItem) return;
    setRenameText(activeItem.name);
    setIsRenaming(true);
  };

  const handleFinishRename = () => {
    if (activeId && renameText.trim()) {
      updateHistoryItem(activeId, { name: renameText.trim() });
    }
    setIsRenaming(false);
  };

  // Send Logic
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    let currentId = activeId;
    if (!currentId) {
      currentId = createNewSession('chat', 'New Conversation');
    }

    setSending(true);
    setInputText('');
    setMenuVisible(false);

    const userMsg = { id: `u-${Date.now()}`, role: 'user', text, createdAt: Date.now() };
    addMessageToItem(currentId, userMsg);

    try {
      // Mock API call
      await new Promise(r => setTimeout(r, 800)); 
      const botMsg = { 
        id: `b-${Date.now()}`, 
        role: 'assistant', 
        text: `I received your message regarding "${activeItem?.name || 'this document'}".`, 
        createdAt: Date.now() 
      };
      addMessageToItem(currentId, botMsg);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  // --- 5. RENDER ---

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        
        {/* HEADER */}
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.historyButton} onPress={() => setHistoryVisible(true)}>
            <Text style={styles.historyButtonText}>☰</Text>
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            {isRenaming ? (
              <TextInput 
                style={styles.renameInput}
                value={renameText}
                onChangeText={setRenameText}
                onBlur={handleFinishRename}
                onSubmitEditing={handleFinishRename}
                autoFocus={true}
                returnKeyType="done"
              />
            ) : (
              <TouchableOpacity onPress={handleStartRename} activeOpacity={0.7}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {activeItem ? activeItem.name : 'Select a Chat'} 
                  {activeItem && <Text style={{fontSize: 12, color: '#aaa'}}> ✎</Text>}
                </Text>
              </TouchableOpacity>
            )}
            {!isRenaming && activeItem && (
              <Text style={styles.headerSubtitle}>{activeItem.type}</Text>
            )}
          </View>
        </View>

        {/* MESSAGES */}
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <ScrollView
            ref={scrollRef}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
          >
            {!activeItem && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No chat selected.</Text>
                <Text style={styles.emptyStateSub}>Start a new chat or upload a document.</Text>
              </View>
            )}

            {activeItem?.messages?.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <View key={index} style={[styles.msgRow, isUser ? styles.rowUser : styles.rowBot]}>
                  {!isUser && <View style={styles.botAvatar}><Text style={styles.botAvatarText}>AI</Text></View>}
                  <View style={[styles.msgBubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
                    <Text style={[styles.msgText, isUser ? styles.textUser : styles.textBot]}>
                      {msg.text}
                    </Text>
                  </View>
                </View>
              );
            })}
            {sending && (
              <View style={{ marginLeft: 40, marginTop: 10 }}>
                <ActivityIndicator size="small" color="#aaa" />
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>

        {/* INPUT BAR */}
        <View style={styles.inputBar}>
          {/* Popup Menu */}
          {menuVisible && (
            <View style={styles.popupMenu}>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleActionRequest('Upload')}>
                <Text style={styles.menuText}>Upload File</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => handleActionRequest('Scan')}>
                <Text style={styles.menuText}>Scan Document</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Plus Button */}
          <TouchableOpacity 
            style={styles.plusButton} 
            onPress={() => setMenuVisible(!menuVisible)}
          >
            <Text style={styles.plusButtonText}>{menuVisible ? '×' : '+'}</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
            multiline
            onFocus={() => setMenuVisible(false)}
          />
          <TouchableOpacity 
            style={[styles.sendButton, (!inputText.trim()) && { opacity: 0.5 }]} 
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>

        {/* HISTORY SIDEBAR */}
        <Modal
          visible={historyVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setHistoryVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setHistoryVisible(false)}
          >
            <View style={styles.sidebarContainer}>
              <Text style={styles.sidebarTitle}>Chats & Docs</Text>
              
              <TouchableOpacity 
                style={styles.newChatButton} 
                onPress={() => createNewSession('chat', 'New Chat')}
              >
                <Text style={styles.newChatText}>+ New Chat</Text>
              </TouchableOpacity>

              <ScrollView style={{ flex: 1 }}>
                {safeHistory.length === 0 && (
                  <Text style={{ color: '#999', padding: 20 }}>No history yet.</Text>
                )}
                {safeHistory.map((item) => {
                  const isActive = item.id === activeId;
                  return (
                    <TouchableOpacity 
                      key={item.id} 
                      style={[styles.historyItem, isActive && styles.historyItemActive]}
                      onPress={() => switchConversation(item)}
                    >
                      <View>
                        <Text style={[styles.historyName, isActive && styles.historyNameActive]}>
                          {item.name}
                        </Text>
                        <Text style={styles.historyDate}>
                          {new Date(item.lastActivityAt || item.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', height: 60,
  },
  historyButton: { padding: 8, marginRight: 12, backgroundColor: '#f1f3f5', borderRadius: 8 },
  historyButtonText: { fontSize: 18, fontWeight: '600' },
  headerTitleContainer: { flex: 1, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  headerSubtitle: { fontSize: 11, color: '#888', textTransform: 'uppercase' },
  renameInput: { fontSize: 16, fontWeight: '700', color: '#333', borderBottomWidth: 1, borderBottomColor: '#007AFF', paddingBottom: 2 },
  messagesList: { flex: 1, backgroundColor: '#f8f9fa' },
  messagesContent: { padding: 16, paddingBottom: 20 },
  msgRow: { flexDirection: 'row', marginBottom: 12 },
  rowUser: { justifyContent: 'flex-end' },
  rowBot: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  bubbleUser: { backgroundColor: '#007AFF', borderBottomRightRadius: 2 },
  bubbleBot: { backgroundColor: '#fff', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: '#e9ecef' },
  msgText: { fontSize: 15, lineHeight: 20 },
  textUser: { color: '#fff' },
  textBot: { color: '#333' },
  botAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#42be65', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 6 },
  botAvatarText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  emptyState: { marginTop: 100, alignItems: 'center' },
  emptyStateText: { fontSize: 18, fontWeight: 'bold', color: '#ccc' },
  emptyStateSub: { fontSize: 14, color: '#ccc', marginTop: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', zIndex: 10 },
  plusButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f3f5', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  plusButtonText: { fontSize: 24, color: '#007AFF', fontWeight: '400', lineHeight: 26 },
  input: { flex: 1, backgroundColor: '#f1f3f5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100, fontSize: 15 },
  sendButton: { marginLeft: 10, backgroundColor: '#007AFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  popupMenu: { position: 'absolute', bottom: 70, left: 10, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 5, width: 160, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 8, borderWidth: 1, borderColor: '#eee' },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuText: { fontSize: 15, color: '#333', fontWeight: '500' },
  menuDivider: { height: 1, backgroundColor: '#f0f0f0' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row' },
  sidebarContainer: { width: '80%', backgroundColor: '#fff', height: '100%', paddingTop: 50, paddingHorizontal: 20 },
  sidebarTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  newChatButton: { backgroundColor: '#42be65', padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  newChatText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  historyItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  historyItemActive: { backgroundColor: '#f0f8ff', marginHorizontal: -10, paddingHorizontal: 10, borderRadius: 8 },
  historyName: { fontSize: 16, color: '#333', fontWeight: '500' },
  historyNameActive: { color: '#007AFF', fontWeight: '700' },
  historyDate: { fontSize: 12, color: '#999', marginTop: 4 },
});