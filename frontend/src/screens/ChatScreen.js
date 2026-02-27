import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, 
  KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView, 
  Modal, TouchableWithoutFeedback, Dimensions, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; 
import { useHistory } from '../context/HistoryContext';
import DocumentPicker from 'react-native-document-picker';
import { colors, shadows, radii } from '../styles/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ==========================================
// 1. SUB-COMPONENTS
// ==========================================

// --- UPDATED: Added onGoHome to Sidebar ---
const SidebarMenu = ({ isVisible, onClose, onGoHome, history, activeChatId, onSelectChat, onNewChat }) => (
  <Modal visible={isVisible} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <TouchableWithoutFeedback onPress={onClose}><View style={styles.modalBackdrop} /></TouchableWithoutFeedback>
      <View style={styles.sidebar}>
        <SafeAreaView style={{flex: 1}}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>History</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
          </View>
          
          {/* NEW: Explicit Home Button */}
          <TouchableOpacity style={styles.homeBtn} onPress={onGoHome}>
            <Ionicons name="home-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.homeBtnText}>Return to Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.newChatBtn} onPress={onNewChat}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>
          
          <ScrollView style={{marginTop: 10}}>
            {history.map((item) => (
              <TouchableOpacity key={item.id} style={[styles.historyRow, activeChatId === item.id && styles.activeHistoryRow]} onPress={() => onSelectChat(item)}>
                <Ionicons name={item.type === 'chat' ? "chatbubble-outline" : "document-text-outline"} size={20} color={activeChatId === item.id ? colors.primary : colors.textMuted} />
                <Text style={[styles.historyLabel, activeChatId === item.id && styles.activeHistoryLabel]} numberOfLines={1}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  </Modal>
);

// --- UPDATED: Added Back Arrow (onGoBack) ---
const ChatHeader = ({ onGoBack, onOpenMenu, onViewDoc, isEditingTitle, titleInput, setTitleInput, onSaveTitle, onStartEdit, activeChat }) => (
  <View style={styles.customHeader}>
    
    {/* NEW: Left Action Group (Back + Menu) */}
    <View style={styles.headerLeft}>
      <TouchableOpacity style={styles.iconButton} onPress={onGoBack}>
        <Ionicons name="chevron-back" size={28} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconButton} onPress={onOpenMenu}>
        <Ionicons name="menu" size={28} color={colors.primary} />
      </TouchableOpacity>
    </View>

    <View style={styles.titleContainer}>
      {isEditingTitle ? (
        <TextInput style={styles.titleInput} value={titleInput} onChangeText={setTitleInput} autoFocus onBlur={onSaveTitle} onSubmitEditing={onSaveTitle} returnKeyType="done" />
      ) : (
        <TouchableOpacity onPress={onStartEdit}>
          <Text style={styles.headerTitle} numberOfLines={1}>{activeChat ? (activeChat.name || 'Untitled Chat') : 'New Chat'}</Text>
        </TouchableOpacity>
      )}
    </View>
    
    <View style={styles.headerRight}>
      {activeChat?.uri || activeChat?.imageUrl ? (
        <TouchableOpacity style={styles.iconButton} onPress={onViewDoc}>
          <Ionicons name="document-text-outline" size={26} color={colors.primary} />
        </TouchableOpacity>
      ) : (
        <View style={{width: 28}} /> /* Spacer */
      )}
    </View>
  </View>
);

const MessageList = ({ messages, isTyping, scrollViewRef }) => (
  <ScrollView ref={scrollViewRef} contentContainerStyle={styles.listContent} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })} keyboardDismissMode="on-drag">
    {messages.length === 0 && (
      <View style={styles.emptyState}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.textPlaceholder} />
        <Text style={styles.emptyText}>Start a new conversation</Text>
      </View>
    )}
    {messages.map((item, index) => (
      <View key={item.id || index} style={[styles.bubble, item.sender === 'user' ? styles.userBubble : styles.botBubble]}>
        <Text style={[styles.msgText, item.sender === 'user' ? styles.userText : styles.botText]}>{item.text}</Text>
      </View>
    ))}
    {isTyping && <ActivityIndicator style={{marginLeft: 20}} size="small" color={colors.primary} />}
  </ScrollView>
);

const AttachmentMenu = ({ isVisible, onUpload, onScan }) => {
  if (!isVisible) return null;
  return (
    <View style={styles.plusMenuContainer}>
      <View style={styles.plusMenuHeader}><Text style={styles.plusMenuWarning}>⚠️ Starts a new chat</Text></View>
      <TouchableOpacity style={styles.plusMenuItem} onPress={onUpload}><Ionicons name="document" size={20} color={colors.textSecondary} /><Text style={styles.plusMenuText}>Upload Document</Text></TouchableOpacity>
      <TouchableOpacity style={styles.plusMenuItem} onPress={onScan}><Ionicons name="camera" size={20} color={colors.textSecondary} /><Text style={styles.plusMenuText}>Scan Document</Text></TouchableOpacity>
      <View style={styles.plusMenuArrow} />
    </View>
  );
};

const ChatInputArea = ({ isPlusMenuOpen, onTogglePlusMenu, input, setInput, onSendMessage }) => (
  <View style={styles.inputContainer}>
    <TouchableOpacity style={styles.attachBtn} onPress={onTogglePlusMenu}>
      <Ionicons name={isPlusMenuOpen ? "close-circle" : "add-circle"} size={32} color={colors.primary} />
    </TouchableOpacity>
    <TextInput style={styles.input} placeholder="Message..." value={input} onChangeText={setInput} onSubmitEditing={onSendMessage} />
    <TouchableOpacity style={styles.sendBtn} onPress={onSendMessage}>
      <Ionicons name="arrow-up" size={20} color="#fff" />
    </TouchableOpacity>
  </View>
);

// ==========================================
// 2. MAIN SCREEN COMPONENT
// ==========================================

export default function ChatScreen({ route, navigation }) {
  const { history, addHistoryItem, addMessageToItem, updateHistoryItem } = useHistory();
  const chatId = route?.params?.chatId;
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const scrollViewRef = useRef();

  const activeChat = useMemo(() => history.find(item => item.id === chatId), [history, chatId]);
  const activeMessages = useMemo(() => activeChat?.messages || [], [activeChat]);

  useEffect(() => { setTitleInput(activeChat ? activeChat.name : 'New Chat'); }, [activeChat]);

  const handleSaveTitle = () => {
    if (activeChat && titleInput.trim()) updateHistoryItem(activeChat.id, { name: titleInput.trim() });
    setIsEditingTitle(false);
  };
  
  // --- NEW: Navigation Actions ---
  const handleGoBack = () => { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('Home', { screen: 'HomeMain' }); };
  const handleGoHome = () => { setIsMenuOpen(false); navigation.navigate('Home', { screen: 'HomeMain' }); };

  const handleSidebarPress = (item) => { navigation.setParams({ chatId: item.id }); setIsMenuOpen(false); setIsPlusMenuOpen(false); };
  const handleNewChat = () => { navigation.setParams({ chatId: null }); setIsMenuOpen(false); setIsPlusMenuOpen(false); };
  const handleScan = () => { setIsPlusMenuOpen(false); navigation.navigate('Scan'); };
  
  const handleUpload = async () => {
    setIsPlusMenuOpen(false);
    try {
      const res = await DocumentPicker.pickSingle({ type: [DocumentPicker.types.pdf, DocumentPicker.types.images], copyTo: 'cachesDirectory' });
      const newItemId = addHistoryItem({ name: res.name, uri: res.fileCopyUri || res.uri, type: res.type, status: 'idle' });
      navigation.navigate('DocumentScreen', { itemId: newItemId });
    } catch (err) { if (!DocumentPicker.isCancel(err)) Alert.alert('Error', 'Failed to pick file'); }
  };

  const handleViewDocument = () => {
    if (activeChat) navigation.navigate('DocumentScreen', { itemId: activeChat.id });
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { id: Date.now().toString(), text: input, sender: 'user', timestamp: Date.now() };

    let activeId = chatId;
    if (!activeId) {
      activeId = addHistoryItem({ type: 'chat', name: input.length > 20 ? input.substring(0, 20) + '...' : input, messages: [], createdAt: Date.now() });
      navigation.setParams({ chatId: activeId });
    }

    addMessageToItem(activeId, userMsg);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const botMsg = { id: (Date.now() + 1).toString(), text: "I analyzed the document.", sender: 'bot', timestamp: Date.now() };
      addMessageToItem(activeId, botMsg);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <SidebarMenu 
        isVisible={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)} 
        onGoHome={handleGoHome} // Added
        history={history} activeChatId={chatId} onSelectChat={handleSidebarPress} onNewChat={handleNewChat} 
      />
      <ChatHeader 
        onGoBack={handleGoBack} // Added
        onOpenMenu={() => setIsMenuOpen(true)} 
        onViewDoc={handleViewDocument} 
        isEditingTitle={isEditingTitle} titleInput={titleInput} setTitleInput={setTitleInput} onSaveTitle={handleSaveTitle} onStartEdit={() => setIsEditingTitle(true)} activeChat={activeChat} 
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <MessageList messages={activeMessages} isTyping={isTyping} scrollViewRef={scrollViewRef} />
        <View style={{zIndex: 10}}> 
          <AttachmentMenu isVisible={isPlusMenuOpen} onUpload={handleUpload} onScan={handleScan} />
          <ChatInputArea isPlusMenuOpen={isPlusMenuOpen} onTogglePlusMenu={() => setIsPlusMenuOpen(!isPlusMenuOpen)} input={input} setInput={setInput} onSendMessage={sendMessage} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ==========================================
// 3. STYLES
// ==========================================
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface }, container: { flex: 1, backgroundColor: colors.surface },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.background, height: 60 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerRight: { width: 60, alignItems: 'flex-end' },
  iconButton: { padding: 5, marginRight: 5 },
  titleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary }, titleInput: { fontSize: 18, fontWeight: '700', textAlign: 'center', borderBottomWidth: 1, borderColor: colors.primary, minWidth: 150 },
  
  modalOverlay: { flex: 1, flexDirection: 'row' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', width: '100%' },
  sidebar: { width: SCREEN_WIDTH * 0.75, backgroundColor: colors.surface, position: 'absolute', left: 0, top: 0, bottom: 0, padding: 20, ...shadows.elevated },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }, sidebarTitle: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary },
  
  // Home Button
  homeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, padding: 12, borderRadius: radii.sm, marginBottom: 15 },
  homeBtnText: { color: colors.textSecondary, fontWeight: '600', marginLeft: 10 },

  newChatBtn: { flexDirection: 'row', backgroundColor: colors.primary, padding: 12, borderRadius: radii.sm, justifyContent: 'center', marginBottom: 20 }, newChatText: { color: colors.textOnPrimary, fontWeight: '600', marginLeft: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radii.sm }, activeHistoryRow: { backgroundColor: colors.primaryFaded }, historyLabel: { marginLeft: 10, fontSize: 16, color: colors.textSecondary }, activeHistoryLabel: { color: colors.primary, fontWeight: '600' },
  listContent: { padding: 20, paddingBottom: 20 }, emptyState: { alignItems: 'center', marginTop: '40%' }, emptyText: { fontSize: 18, fontWeight: '700', color: colors.textPlaceholder, marginTop: 15 },
  bubble: { maxWidth: '80%', padding: 14, borderRadius: radii.lg, marginBottom: 12 }, userBubble: { alignSelf: 'flex-end', backgroundColor: colors.chatUserBubble, borderBottomRightRadius: 4 }, botBubble: { alignSelf: 'flex-start', backgroundColor: colors.chatBotBubble, borderBottomLeftRadius: 4 }, msgText: { fontSize: 16 }, userText: { color: colors.textOnPrimary }, botText: { color: colors.textSecondary },
  inputContainer: { flexDirection: 'row', padding: 12, alignItems: 'center', borderTopWidth: 1, borderColor: colors.background, backgroundColor: colors.surface }, input: { flex: 1, backgroundColor: colors.background, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 10, color: colors.textSecondary }, attachBtn: { padding: 5 }, sendBtn: { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  plusMenuContainer: { position: 'absolute', bottom: 80, left: 20, width: 200, backgroundColor: colors.surface, borderRadius: radii.md, ...shadows.elevated, padding: 5 }, plusMenuHeader: { padding: 8, borderBottomWidth: 1, borderColor: colors.divider }, plusMenuWarning: { fontSize: 12, color: colors.warning, fontWeight: '600' }, plusMenuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 }, plusMenuText: { marginLeft: 10, fontSize: 15, color: colors.textSecondary }, plusMenuArrow: { position: 'absolute', bottom: -10, left: 20, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 10, borderStyle: 'solid', backgroundColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.surface }
});