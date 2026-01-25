import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, 
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView, 
  Modal, TouchableWithoutFeedback, Dimensions, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; 
import { useHistory } from '../context/HistoryContext';
import DocumentPicker from 'react-native-document-picker';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ChatScreen({ route, navigation }) {
  const { history, addHistoryItem, addMessageToItem, updateHistoryItem } = useHistory();
  const scrollViewRef = useRef();

  // --- PARAMS & STATE ---
  const chatId = route?.params?.chatId;
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // UI States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false); // New Plus Menu
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  // --- 1. GET ACTIVE DATA ---
  const activeChat = useMemo(() => {
    return history.find(item => item.id === chatId);
  }, [history, chatId]);

  const activeMessages = useMemo(() => {
    if (!activeChat || !activeChat.messages) return [];
    return activeChat.messages; 
  }, [activeChat]);

  // Sync title input
  useEffect(() => {
    if (activeChat) {
      setTitleInput(activeChat.name);
    } else {
      setTitleInput('New Chat');
    }
  }, [activeChat]);

  // --- 2. TITLE EDITING ---
  const handleSaveTitle = () => {
    if (activeChat && titleInput.trim()) {
      updateHistoryItem(activeChat.id, { name: titleInput.trim() });
    }
    setIsEditingTitle(false);
  };

  // --- 3. SIDEBAR NAVIGATION ---
  const handleSidebarPress = (item) => {
    // REQUEST FIX: Clicking sidebar ALWAYS opens Chat, regardless of type
    navigation.setParams({ chatId: item.id });
    setIsMenuOpen(false);
    setIsPlusMenuOpen(false);
  };

  const handleNewChat = () => {
    navigation.setParams({ chatId: null });
    setIsMenuOpen(false);
    setIsPlusMenuOpen(false);
  };

  // --- 4. UPLOAD / SCAN LOGIC (NEW CHAT) ---
  const handleScan = () => {
    setIsPlusMenuOpen(false);
    navigation.navigate('Scan'); // Scan screen handles the "New" logic internally
  };

  const handleUpload = async () => {
    setIsPlusMenuOpen(false);
    try {
      // REQUEST FIX: Only start new chat if user actually picks a file
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.images],
        copyTo: 'cachesDirectory',
      });
      
      // Success: Create Item & Navigate
      const newItemId = addHistoryItem({
        name: res.name,
        uri: res.fileCopyUri || res.uri,
        type: res.type,
        status: 'idle', 
      });
      // Navigate to DocView (which implicitly acts as the start of this new chat context)
      navigation.navigate('DocView', { itemId: newItemId });

    } catch (err) {
      // Cancelled: Do nothing (No new chat created)
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Error', 'Failed to pick file');
      }
    }
  };

  // --- 5. TEXT CHAT LOGIC ---
  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { 
      id: Date.now().toString(), 
      text: input, 
      sender: 'user', 
      timestamp: Date.now() 
    };

    let activeId = chatId;
    if (!activeId) {
      activeId = addHistoryItem({
        type: 'chat',
        name: input.length > 20 ? input.substring(0, 20) + '...' : input,
        messages: [],
        createdAt: Date.now()
      });
      navigation.setParams({ chatId: activeId });
    }

    addMessageToItem(activeId, userMsg);
    setInput('');
    setIsTyping(true);

    try {
      setTimeout(() => {
        const botMsg = { 
          id: (Date.now() + 1).toString(), 
          text: "I analyzed the document.", 
          sender: 'bot',
          timestamp: Date.now()
        };
        addMessageToItem(activeId, botMsg);
        setIsTyping(false);
      }, 1500);
    } catch (error) {
      setIsTyping(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      
      {/* --- SIDEBAR MENU MODAL --- */}
      <Modal visible={isMenuOpen} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setIsMenuOpen(false)}>
             <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.sidebar}>
            <SafeAreaView style={{flex: 1}}>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>History</Text>
                <TouchableOpacity onPress={() => setIsMenuOpen(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.newChatBtn} onPress={handleNewChat}>
                <Ionicons name="add" size={24} color="#fff" />
                <Text style={styles.newChatText}>New Chat</Text>
              </TouchableOpacity>
              <ScrollView style={{marginTop: 10}}>
                {history.map((item) => (
                  <TouchableOpacity 
                    key={item.id} 
                    style={[styles.historyRow, chatId === item.id && styles.activeHistoryRow]}
                    onPress={() => handleSidebarPress(item)}
                  >
                    <Ionicons 
                      name={item.type === 'chat' ? "chatbubble-outline" : "document-text-outline"} 
                      size={20} 
                      color={chatId === item.id ? "#007AFF" : "#666"} 
                    />
                    <Text 
                      style={[styles.historyLabel, chatId === item.id && styles.activeHistoryLabel]} 
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </SafeAreaView>
          </View>
        </View>
      </Modal>

      {/* --- HEADER --- */}
      <View style={styles.customHeader}>
        <TouchableOpacity style={styles.iconButton} onPress={() => setIsMenuOpen(true)}>
          <Ionicons name="menu" size={28} color="#007AFF" />
        </TouchableOpacity>

        {/* REQUEST FIX: Title is clickable to edit */}
        <View style={styles.titleContainer}>
          {isEditingTitle ? (
            <TextInput
              style={styles.titleInput}
              value={titleInput}
              onChangeText={setTitleInput}
              autoFocus
              onBlur={handleSaveTitle}
              onSubmitEditing={handleSaveTitle}
              returnKeyType="done"
            />
          ) : (
            <TouchableOpacity onPress={() => setIsEditingTitle(true)}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {activeChat ? (activeChat.name || 'Untitled Chat') : 'New Chat'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Spacer to balance header */}
        <View style={{width: 30}} />
      </View>

      {/* --- CHAT LIST --- */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.container}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="on-drag"
        >
          {activeMessages.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Start a new conversation</Text>
            </View>
          )}

          {activeMessages.map((item, index) => (
            <View 
              key={item.id || index} 
              style={[styles.bubble, item.sender === 'user' ? styles.userBubble : styles.botBubble]}
            >
              <Text style={[styles.msgText, item.sender === 'user' ? styles.userText : styles.botText]}>
                {item.text}
              </Text>
            </View>
          ))}
          {isTyping && <ActivityIndicator style={{marginLeft: 20}} size="small" color="#007AFF" />}
        </ScrollView>

        {/* --- INPUT AREA --- */}
        <View style={{zIndex: 10}}> 
          {/* REQUEST FIX: Plus Menu Popup */}
          {isPlusMenuOpen && (
            <View style={styles.plusMenuContainer}>
               <View style={styles.plusMenuHeader}>
                  <Text style={styles.plusMenuWarning}>⚠️ Starts a new chat</Text>
               </View>
               <TouchableOpacity style={styles.plusMenuItem} onPress={handleUpload}>
                  <Ionicons name="document" size={20} color="#333" />
                  <Text style={styles.plusMenuText}>Upload Document</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.plusMenuItem} onPress={handleScan}>
                  <Ionicons name="camera" size={20} color="#333" />
                  <Text style={styles.plusMenuText}>Scan Document</Text>
               </TouchableOpacity>
               <View style={styles.plusMenuArrow} />
            </View>
          )}

          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.attachBtn} onPress={() => setIsPlusMenuOpen(!isPlusMenuOpen)}>
              <Ionicons name={isPlusMenuOpen ? "close-circle" : "add-circle"} size={32} color="#007AFF" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.input}
              placeholder="Message..."
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
            />
            
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  customHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#F2F4F8', height: 60 },
  iconButton: { padding: 5 },
  titleContainer: { flex: 1, marginHorizontal: 10, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  titleInput: { fontSize: 18, fontWeight: '700', textAlign: 'center', borderBottomWidth: 1, borderColor: '#007AFF', minWidth: 150 },

  // Sidebar
  modalOverlay: { flex: 1, flexDirection: 'row' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', width: '100%' },
  sidebar: { width: SCREEN_WIDTH * 0.75, backgroundColor: '#fff', position: 'absolute', left: 0, top: 0, bottom: 0, padding: 20, shadowRadius: 10 },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  sidebarTitle: { fontSize: 22, fontWeight: 'bold' },
  newChatBtn: { flexDirection: 'row', backgroundColor: '#007AFF', padding: 12, borderRadius: 8, justifyContent: 'center', marginBottom: 20 },
  newChatText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8 },
  activeHistoryRow: { backgroundColor: '#F0F8FF' },
  historyLabel: { marginLeft: 10, fontSize: 16, color: '#333' },
  activeHistoryLabel: { color: '#007AFF', fontWeight: '600' },

  // Chat
  listContent: { padding: 20, paddingBottom: 20 },
  emptyState: { alignItems: 'center', marginTop: '40%' },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#ccc', marginTop: 15 },
  bubble: { maxWidth: '80%', padding: 14, borderRadius: 20, marginBottom: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#F2F4F8', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 16 },
  userText: { color: '#fff' },
  botText: { color: '#333' },

  // Input & Plus Menu
  inputContainer: { flexDirection: 'row', padding: 12, alignItems: 'center', borderTopWidth: 1, borderColor: '#F2F4F8', backgroundColor: '#fff' },
  input: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 10 },
  attachBtn: { padding: 5 },
  sendBtn: { backgroundColor: '#007AFF', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  // New Plus Menu Styles
  plusMenuContainer: {
    position: 'absolute',
    bottom: 80, // Anchored above input
    left: 20,
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    padding: 5,
  },
  plusMenuHeader: { padding: 8, borderBottomWidth: 1, borderColor: '#eee' },
  plusMenuWarning: { fontSize: 12, color: '#FF9500', fontWeight: '600' },
  plusMenuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  plusMenuText: { marginLeft: 10, fontSize: 15, color: '#333' },
  plusMenuArrow: {
    position: 'absolute',
    bottom: -10,
    left: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  }
});