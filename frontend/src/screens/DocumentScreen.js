import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, 
  ActivityIndicator, Alert, Platform, Linking, TextInput, 
  KeyboardAvoidingView, Keyboard, Modal, SafeAreaView 
} from 'react-native';
import { useHistory } from '../context/HistoryContext';
import { Ionicons } from '@expo/vector-icons'; 
import * as Clipboard from 'expo-clipboard';
import axios from 'axios';
import Pdf from 'react-native-pdf';

const DEV_MOCK = true; 
const API_HOST = Platform.select({ android: 'http://10.0.2.2:4200', ios: 'http://localhost:4200', default: 'http://localhost:4200' });

const DocumentPreview = ({ displayImage, isPDF, safePdfUri, hasARData }) => (
  <View style={styles.imageContainer}>
    {displayImage ? (
      isPDF && !displayImage.startsWith('http') ? ( <Pdf source={{ uri: safePdfUri, cache: false }} style={styles.pdfViewer} trustAllCerts={false} /> ) : ( <Image source={{ uri: displayImage }} style={styles.thumbnail} resizeMode="contain" /> )
    ) : (
      <View style={styles.placeholder}><Ionicons name="document-text-outline" size={60} color="#ccc" /><Text style={{ color: '#999', marginTop: 10 }}>No Preview</Text></View>
    )}
    {hasARData && <View style={styles.badge}><Text style={styles.badgeText}>AR Ready</Text></View>}
  </View>
);

const PreviewCarousel = ({ previews, selectedIndex, onSelect }) => (
  <View style={styles.carouselContainer}>
    <Text style={styles.carouselTitle}>Document Pages ({previews.length})</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {previews.map((preview, index) => (
        <TouchableOpacity key={preview.id} style={[styles.thumbnailWrap, selectedIndex === index && styles.thumbnailActive]} onPress={() => onSelect(index)}>
          <Image source={{ uri: preview.imageUrl }} style={styles.miniThumb} resizeMode="cover" />
          {preview.arElements?.length > 0 && <View style={styles.miniBadge} />}
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
);

const DocumentActions = ({ item, hasARData, isPDF, onAnalyze, onLaunchAR, onOpenFullPdf }) => {
  if (item.status === 'analyzing') return ( <View style={[styles.card, { alignItems: 'center', paddingVertical: 20, marginBottom: 20 }]}><ActivityIndicator size="large" color="#5856D6" /><Text style={styles.analyzingText}>Analyzing Document...</Text></View> );
  if (item.status === 'failed') return ( <View style={styles.actionSection}><View style={styles.errorBox}><Ionicons name="alert-circle" size={40} color="#FF3B30" /><Text style={styles.errorTitle}>Analysis Failed</Text><Text style={styles.errorText}>{item.error}</Text></View><TouchableOpacity style={styles.retryBtn} onPress={onAnalyze}><Text style={styles.retryText}>Retry Analysis</Text></TouchableOpacity></View> );
  if (item.status === 'completed') return (
      <View style={styles.actionSection}>
        {hasARData ? ( <TouchableOpacity style={styles.arButton} onPress={onLaunchAR}><Ionicons name="cube-outline" size={24} color="#fff" style={{ marginRight: 10 }} /><Text style={styles.arButtonText}>Launch AR Visualization</Text></TouchableOpacity> ) : ( <View style={[styles.card, { marginBottom: 15 }]}><Text style={{ color: '#666', fontStyle: 'italic' }}>No AR components detected on this page.</Text></View> )}
        {isPDF && ( <TouchableOpacity style={styles.pdfButton} onPress={onOpenFullPdf}><Ionicons name="book-outline" size={20} color="#007AFF" style={{ marginRight: 8 }} /><Text style={styles.pdfButtonText}>Read Full PDF</Text></TouchableOpacity> )}
      </View>
    );
  return ( <View style={styles.actionSection}><TouchableOpacity style={styles.analyzeBtn} onPress={onAnalyze}><Ionicons name="scan-outline" size={20} color="#fff" style={{ marginRight: 8 }} /><Text style={styles.analyzeBtnText}>Analyze Document</Text></TouchableOpacity></View> );
};

const DocumentDetails = ({ item }) => (
  <><View style={styles.section}><Text style={styles.sectionTitle}>AI Summary</Text><View style={styles.card}><Text style={styles.summaryText}>{item.analysisSummary || "No summary available."}</Text></View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>File Details</Text><View style={styles.card}><Text style={styles.detailText}>Name: {item.name}</Text><Text style={styles.detailText}>Status: {item.status || 'Not Analyzed'}</Text></View></View>
  </>
);

// --- UPDATED: Uses Expand button and handles `sender` instead of `role` ---
const ChatOverlay = ({ onClose, onExpand, messages, inputText, setInputText, onSend, scrollViewRef }) => {
  const handlePasteQuestion = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setInputText(`Can you explain this part of the document: "${text}"`);
    else Alert.alert("Clipboard Empty", "Copy some text from the PDF first!");
  };

  return (
    <View style={styles.chatOverlay}>
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>Document Chat</Text>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          {/* NEW: Expand to full screen chat */}
          {onExpand && (
            <TouchableOpacity onPress={onExpand} style={{marginRight: 15}}>
              <Ionicons name="expand-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={28} color="#999" /></TouchableOpacity>
        </View>
      </View>
      <ScrollView style={styles.chatScroll} ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
        {messages.map(msg => (
          <View key={msg.id} style={[styles.msgBubble, msg.sender === 'user' ? styles.userBubble : styles.botBubble]}>
            <Text style={[styles.msgText, msg.sender === 'user' ? { color: '#fff' } : { color: '#333' }]}>{msg.text}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.chatInputContainer}>
        <TouchableOpacity style={styles.pasteButton} onPress={handlePasteQuestion}><Ionicons name="clipboard-outline" size={20} color="#5856D6" /></TouchableOpacity>
        <TextInput style={styles.chatInput} placeholder="Ask or paste text..." placeholderTextColor="#999" value={inputText} onChangeText={setInputText} onSubmitEditing={onSend} />
        <TouchableOpacity style={styles.sendButton} onPress={onSend}><Ionicons name="send" size={18} color="#fff" /></TouchableOpacity>
      </View>
    </View>
  );
};

const FullPdfModal = ({ visible, onClose, safePdfUri, title, isChatOpen, setIsChatOpen, messages, inputText, setInputText, onSend, onExpand, scrollViewRef }) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.fullPdfContainer}>
      <View style={styles.fullPdfHeader}>
        <Text style={styles.fullPdfTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity onPress={onClose} style={styles.fullPdfCloseBtn}><Text style={styles.fullPdfCloseText}>Done</Text></TouchableOpacity>
      </View>
      <Pdf source={{ uri: safePdfUri, cache: false }} style={styles.fullPdfViewer} trustAllCerts={false} />
      {!isChatOpen && <TouchableOpacity style={styles.fab} onPress={() => setIsChatOpen(true)}><Ionicons name="chatbubble-ellipses" size={24} color="#fff" /></TouchableOpacity>}
      {isChatOpen && <ChatOverlay onClose={() => setIsChatOpen(false)} onExpand={onExpand} messages={messages} inputText={inputText} setInputText={setInputText} onSend={onSend} scrollViewRef={scrollViewRef} />}
    </SafeAreaView>
  </Modal>
);

export default function DocumentScreen({ route, navigation }) {
  const { itemId } = route.params;
  const { history, updateHistoryItem, deleteHistoryItem, addMessageToItem } = useHistory(); // NEW: Extracted addMessageToItem
  const item = history.find(i => i.id === itemId);

  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFullPdfOpen, setIsFullPdfOpen] = useState(false); 
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const scrollViewRef = useRef(null);

  // --- UPDATED: Uses unified item.messages ---
  useEffect(() => {
    if (item?.messages && item.messages.length > 0) {
      setMessages(item.messages);
    } else if (item) {
      setMessages([{ id: '0', sender: 'bot', text: 'Hello! Ask me anything about this document.' }]);
    }
  }, [item?.messages]);

  useEffect(() => { if (!item && navigation.canGoBack()) navigation.goBack(); }, [item, navigation]);
  useLayoutEffect(() => { navigation.setOptions({ headerRight: () => ( <TouchableOpacity onPress={handleDelete} style={{ marginRight: 15 }}><Ionicons name="trash-outline" size={24} color="#FF3B30" /></TouchableOpacity> ), title: item ? (item.name || 'Document') : 'Loading...', }); }, [navigation, item]);

  if (!item) return ( <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color="#5856D6" /></View> );

  const activePreview = item.previews ? item.previews[selectedPreviewIndex] : null;
  const displayImage = activePreview ? activePreview.imageUrl : (item.uri || item.imageUrl);
  const activeArElements = activePreview ? activePreview.arElements : (item.arElements || []);
  const hasARData = item.status === 'completed' && activeArElements.length > 0;
  const isPDF = item.type === 'application/pdf' || (item.name && item.name.toLowerCase().endsWith('.pdf'));

  let safePdfUri = displayImage;
  if (safePdfUri && !safePdfUri.startsWith('http')) {
    safePdfUri = decodeURIComponent(safePdfUri);
    if (Platform.OS === 'ios' && !safePdfUri.startsWith('file://')) safePdfUri = `file://${safePdfUri}`;
    else if (Platform.OS === 'android' && !safePdfUri.startsWith('file://') && !safePdfUri.startsWith('content://')) safePdfUri = `file://${safePdfUri}`;
  }

  const handleDelete = () => { Alert.alert("Delete Document", "Are you sure?", [ { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { deleteHistoryItem(itemId); } } ]); };

  // --- UPDATED: Uses unified addMessageToItem ---
  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const userMsg = { id: Date.now().toString(), sender: 'user', text: inputText, timestamp: Date.now() };
    
    // Updates UI and Database simultaneously via Context
    addMessageToItem(itemId, userMsg);
    setInputText('');
    Keyboard.dismiss();

    setTimeout(() => {
      const botMsg = { id: (Date.now() + 1).toString(), sender: 'bot', text: "(Offline Mock) I received your query.", timestamp: Date.now() };
      addMessageToItem(itemId, botMsg);
    }, 1000);
  };

  // --- NEW: Expand Chat function ---
  const expandToFullChat = () => {
    setIsChatOpen(false);
    setIsFullPdfOpen(false); // Close modal if open
    navigation.navigate('Chat', { chatId: itemId });
  };

  const handleLaunchAR = () => { navigation.navigate('ARScreen', { imageUri: displayImage, arElements: activeArElements, itemId: item.id }); };
  const runAnalysis = async () => {
    updateHistoryItem(itemId, { status: 'analyzing', error: null });
    if (DEV_MOCK) {
      setTimeout(() => { updateHistoryItem(itemId, { status: 'completed', analysisSummary: "Offline Mock Summary: Document successfully analyzed.", previews: [ { id: 'page1', imageUrl: item.uri, arElements: [{ id: "1", label: "Pressure Valve", x: 0.5, y: 0.5, width: 0.1, height: 0.1 }] } ] }); }, 1500); 
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container}>
        <DocumentPreview displayImage={displayImage} isPDF={isPDF} safePdfUri={safePdfUri} hasARData={hasARData} />
        {item.previews?.length > 1 && <PreviewCarousel previews={item.previews} selectedIndex={selectedPreviewIndex} onSelect={setSelectedPreviewIndex} />}
        <DocumentActions item={item} hasARData={hasARData} isPDF={isPDF} onAnalyze={runAnalysis} onLaunchAR={handleLaunchAR} onOpenFullPdf={() => setIsFullPdfOpen(true)} />
        <DocumentDetails item={item} />
        <View style={{ height: 80 }} /> 
      </ScrollView>

      {!isChatOpen && <TouchableOpacity style={styles.fab} onPress={() => setIsChatOpen(true)}><Ionicons name="chatbubble-ellipses" size={24} color="#fff" /></TouchableOpacity>}
      {isChatOpen && <ChatOverlay onClose={() => setIsChatOpen(false)} onExpand={expandToFullChat} messages={messages} inputText={inputText} setInputText={setInputText} onSend={handleSendMessage} scrollViewRef={scrollViewRef} />}

      <FullPdfModal visible={isFullPdfOpen} onClose={() => setIsFullPdfOpen(false)} safePdfUri={safePdfUri} title={item.name} isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} messages={messages} inputText={inputText} setInputText={setInputText} onSend={handleSendMessage} onExpand={expandToFullChat} scrollViewRef={scrollViewRef} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#F2F4F8' },
  imageContainer: { height: 350, backgroundColor: '#E1E4E8', borderRadius: 12, marginBottom: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#ddd' },
  thumbnail: { width: '100%', height: '100%' }, pdfViewer: { flex: 1, width: '100%', height: '100%', backgroundColor: '#E1E4E8' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#34C759', padding: 6, borderRadius: 6 }, badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  carouselContainer: { marginBottom: 20 }, carouselTitle: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 }, thumbnailWrap: { width: 70, height: 70, borderRadius: 8, marginRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' }, thumbnailActive: { borderColor: '#5856D6' }, miniThumb: { width: '100%', height: '100%' }, miniBadge: { position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759', borderWidth: 1, borderColor: '#fff' },
  actionSection: { marginBottom: 20 }, analyzeBtn: { flexDirection: 'row', backgroundColor: '#5856D6', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, analyzeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }, arButton: { flexDirection: 'row', backgroundColor: '#007AFF', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, arButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }, pdfButton: { flexDirection: 'row', backgroundColor: '#e6f0ff', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#007AFF' }, pdfButtonText: { color: '#007AFF', fontSize: 16, fontWeight: 'bold' },
  errorBox: { alignItems: 'center', marginBottom: 15, padding: 15, backgroundColor: '#ffebeb', borderRadius: 12 }, errorTitle: { fontSize: 18, fontWeight: 'bold', color: '#FF3B30', marginTop: 5 }, errorText: { textAlign: 'center', color: '#333', marginTop: 5 }, retryBtn: { padding: 16, backgroundColor: '#FF3B30', borderRadius: 12, alignItems: 'center' }, retryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }, analyzingText: { marginTop: 10, fontSize: 16, fontWeight: '600', color: '#333' },
  section: { marginBottom: 20 }, sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#1A1A1A' }, card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 }, summaryText: { fontSize: 15, lineHeight: 22, color: '#333' }, detailText: { marginBottom: 5, color:'#333' },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#5856D6', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: {width: 0, height: 4}, elevation: 5 },
  chatOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', backgroundColor: '#F2F4F8', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: {width: 0, height: -5}, shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#ddd' }, chatTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' }, chatScroll: { flex: 1, padding: 15 }, msgBubble: { padding: 12, borderRadius: 16, marginBottom: 10, maxWidth: '80%' }, userBubble: { backgroundColor: '#5856D6', alignSelf: 'flex-end', borderBottomRightRadius: 4 }, botBubble: { backgroundColor: '#E1E4E8', alignSelf: 'flex-start', borderBottomLeftRadius: 4 }, msgText: { fontSize: 15, lineHeight: 20 },
  chatInputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#ddd', paddingBottom: Platform.OS === 'ios' ? 25 : 10 }, pasteButton: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, marginRight: 5 }, chatInput: { flex: 1, backgroundColor: '#F2F4F8', borderRadius: 20, paddingHorizontal: 15, fontSize: 15, maxHeight: 100, color: '#333' }, sendButton: { backgroundColor: '#5856D6', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, alignSelf: 'flex-end' },
  fullPdfContainer: { flex: 1, backgroundColor: '#000' }, fullPdfHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#111' }, fullPdfTitle: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1, marginRight: 15 }, fullPdfCloseBtn: { backgroundColor: '#333', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 }, fullPdfCloseText: { color: '#fff', fontWeight: 'bold' }, fullPdfViewer: { flex: 1, width: '100%', backgroundColor: '#222' }
});