import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  TextInput, ScrollView, KeyboardAvoidingView, Platform, 
  Keyboard, Animated, Dimensions, Image, PanResponder
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHistory } from '../context/HistoryContext';
import { colors, radii } from '../styles/theme';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// ==========================================
// INTERACTIVE DIAGRAM VIEWER WITH ZOOM & PAN
// ==========================================

const InteractiveDiagramViewer = ({ imageUri, arElements, onBoxPress, selectedElementId }) => {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  
  const [currentScale, setCurrentScale] = useState(1);
  const [currentTranslate, setCurrentTranslate] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (imageUri) {
      Image.getSize(imageUri, (width, height) => {
        const aspectRatio = width / height;
        const maxWidth = SCREEN_WIDTH * 0.9;
        const maxHeight = SCREEN_HEIGHT * 0.6;
        
        let finalWidth = maxWidth;
        let finalHeight = maxWidth / aspectRatio;
        
        if (finalHeight > maxHeight) {
          finalHeight = maxHeight;
          finalWidth = maxHeight * aspectRatio;
        }
        
        setImageSize({ width: finalWidth, height: finalHeight });
      });
    }
  }, [imageUri]);

  // Track scale and position values
  useEffect(() => {
    const scaleListener = scale.addListener(({ value }) => setCurrentScale(value));
    const xListener = translateX.addListener(({ value }) => {
      setCurrentTranslate(prev => ({ ...prev, x: value }));
    });
    const yListener = translateY.addListener(({ value }) => {
      setCurrentTranslate(prev => ({ ...prev, y: value }));
    });

    return () => {
      scale.removeListener(scaleListener);
      translateX.removeListener(xListener);
      translateY.removeListener(yListener);
    };
  }, []);

  // Pinch and Pan gesture handling
  const lastScale = useRef(1);
  const lastTranslate = useRef({ x: 0, y: 0 });
  const distance = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderGrant: (evt) => {
        lastScale.current = currentScale;
        lastTranslate.current = currentTranslate;
        
        // Check for two fingers (pinch gesture)
        if (evt.nativeEvent.touches.length === 2) {
          const touch1 = evt.nativeEvent.touches[0];
          const touch2 = evt.nativeEvent.touches[1];
          distance.current = Math.sqrt(
            Math.pow(touch2.pageX - touch1.pageX, 2) +
            Math.pow(touch2.pageY - touch1.pageY, 2)
          );
        }
      },
      
      onPanResponderMove: (evt, gestureState) => {
        // Pinch to zoom
        if (evt.nativeEvent.touches.length === 2) {
          const touch1 = evt.nativeEvent.touches[0];
          const touch2 = evt.nativeEvent.touches[1];
          const currentDistance = Math.sqrt(
            Math.pow(touch2.pageX - touch1.pageX, 2) +
            Math.pow(touch2.pageY - touch1.pageY, 2)
          );
          
          const newScale = Math.max(0.5, Math.min(3, lastScale.current * (currentDistance / distance.current)));
          scale.setValue(newScale);
        } 
        // Pan gesture (single finger)
        else if (currentScale > 1) {
          translateX.setValue(lastTranslate.current.x + gestureState.dx);
          translateY.setValue(lastTranslate.current.y + gestureState.dy);
        }
      },
      
      onPanResponderRelease: () => {
        lastScale.current = currentScale;
        lastTranslate.current = currentTranslate;
      }
    })
  ).current;

  const handleZoomIn = () => {
    const newScale = Math.min(3, currentScale + 0.3);
    Animated.spring(scale, {
      toValue: newScale,
      useNativeDriver: true,
      tension: 50,
      friction: 7
    }).start();
  };

  const handleZoomOut = () => {
    const newScale = Math.max(0.5, currentScale - 0.3);
    Animated.spring(scale, {
      toValue: newScale,
      useNativeDriver: true,
      tension: 50,
      friction: 7
    }).start();
  };

  const handleReset = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 50, friction: 7 })
    ]).start();
  };

  return (
    <View style={styles.viewerContainer}>
      {/* Instructions overlay */}
      <View style={styles.instructionsOverlay}>
        <Text style={styles.instructionText}>
          <Ionicons name="hand-left" size={14} color={colors.primaryLight} /> Pinch to zoom • 
          <Ionicons name="move" size={14} color={colors.primaryLight} /> Drag to pan
        </Text>
      </View>

      {/* Diagram with gestures */}
      <View style={styles.diagramWrapper} {...panResponder.panHandlers}>
        <Animated.View
          style={{
            transform: [
              { translateX: translateX },
              { translateY: translateY },
              { scale: scale }
            ]
          }}
        >
          <View style={{ position: 'relative' }}>
            <Image 
              source={{ uri: imageUri }} 
              style={{ 
                width: imageSize.width, 
                height: imageSize.height,
                backgroundColor: '#0F1419'
              }}
              resizeMode="contain"
            />
            
            {/* Interactive component boxes */}
            {arElements?.map((el) => {
              const isSelected = selectedElementId === el.id;
              return (
                <TouchableOpacity
                  key={el.id}
                  onPress={() => onBoxPress(el)}
                  activeOpacity={0.7}
                  style={{
                    position: 'absolute',
                    left: el.x * imageSize.width,
                    top: el.y * imageSize.height,
                    width: el.width * imageSize.width,
                    height: el.height * imageSize.height,
                    backgroundColor: isSelected 
                      ? 'rgba(255, 183, 77, 0.35)' 
                      : colors.primaryFaded,
                    borderWidth: 2,
                    borderColor: isSelected ? '#FFB74D' : colors.primary,
                    borderRadius: 6,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {isSelected && (
                    <View style={styles.selectedPulse}>
                      <Ionicons name="checkmark-circle" size={24} color="#FFB74D" />
                    </View>
                  )}
                  
                  {/* Component label on hover */}
                  <View style={styles.componentLabelBadge}>
                    <Text style={styles.componentLabelText} numberOfLines={1}>
                      {el.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>

      {/* Zoom Controls */}
      <ZoomControls 
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        currentZoom={currentScale}
      />
    </View>
  );
};

// ==========================================
// ZOOM CONTROLS
// ==========================================

const ZoomControls = ({ onZoomIn, onZoomOut, onReset, currentZoom }) => (
  <View style={styles.zoomControls}>
    <TouchableOpacity style={styles.zoomButton} onPress={onZoomOut}>
      <Ionicons name="remove" size={22} color={colors.textOnPrimary} />
    </TouchableOpacity>
    
    <View style={styles.zoomIndicator}>
      <Text style={styles.zoomText}>{Math.round(currentZoom * 100)}%</Text>
    </View>
    
    <TouchableOpacity style={styles.zoomButton} onPress={onZoomIn}>
      <Ionicons name="add" size={22} color={colors.textOnPrimary} />
    </TouchableOpacity>
    
    <TouchableOpacity style={[styles.zoomButton, styles.resetButton]} onPress={onReset}>
      <Ionicons name="refresh" size={18} color={colors.textOnPrimary} />
    </TouchableOpacity>
  </View>
);

// ==========================================
// COMPONENT INFO CARD
// ==========================================

const ComponentInfoCard = ({ selectedElement, onOpenChat, onClose }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 8
    }).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.infoCard,
        {
          transform: [{
            translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [100, 0]
            })
          }],
          opacity: slideAnim
        }
      ]}
    >
      <View style={styles.infoCardHeader}>
        <View style={styles.componentIconContainer}>
          <Ionicons name="cube-outline" size={24} color={colors.primaryLight} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.infoCardLabel}>SELECTED COMPONENT</Text>
          <Text style={styles.infoCardTitle}>{selectedElement.label}</Text>
          {selectedElement.description && (
            <Text style={styles.infoCardDescription} numberOfLines={2}>
              {selectedElement.description}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#8B92A0" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.infoCardActions}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.primaryAction]} 
          onPress={onOpenChat}
        >
          <Ionicons name="chatbubbles" size={18} color={colors.textOnPrimary} />
          <Text style={styles.actionButtonText}>Ask Questions</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// ==========================================
// CHAT INTERFACE
// ==========================================

const ChatInterface = ({ 
  title, 
  onClose, 
  onExpand, 
  messages, 
  inputText, 
  setInputText, 
  onSend, 
  scrollViewRef,
  isTyping 
}) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 9
    }).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.chatContainer,
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.chatHandle} />
      
      <View style={styles.chatHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatHeaderLabel}>AI ASSISTANT</Text>
          <Text style={styles.chatHeaderTitle}>{title}</Text>
        </View>
        <TouchableOpacity onPress={onExpand} style={styles.chatHeaderButton}>
          <Ionicons name="expand-outline" size={22} color={colors.primaryLight} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={styles.chatHeaderButton}>
          <Ionicons name="close" size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.chatScroll} 
        ref={scrollViewRef}
        contentContainerStyle={styles.chatScrollContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.messageBubble,
              msg.sender === 'user' ? styles.userMessage : styles.botMessage,
            ]}
          >
            {msg.sender === 'bot' && (
              <View style={styles.botAvatar}>
                <Ionicons name="sparkles" size={14} color={colors.primaryLight} />
              </View>
            )}
            <View style={msg.sender === 'user' ? styles.userBubbleContent : styles.botBubbleContent}>
              <Text style={msg.sender === 'user' ? styles.userMessageText : styles.botMessageText}>
                {msg.text}
              </Text>
              <Text style={msg.sender === 'user' ? styles.userMessageTime : styles.botMessageTime}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        ))}
        
        {isTyping && (
          <View style={[styles.messageBubble, styles.botMessage]}>
            <View style={styles.botAvatar}>
              <Ionicons name="sparkles" size={14} color={colors.primaryLight} />
            </View>
            <View style={styles.typingIndicator}>
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.chatInputWrapper}>
        <View style={styles.chatInputContainer}>
          <TextInput
            style={styles.chatInput}
            placeholder="Ask about this component..."
            placeholderTextColor="#626976"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={onSend}
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]} 
            onPress={onSend}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={18} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const QuickHelpButton = ({ onPress }) => (
  <TouchableOpacity style={styles.helpFab} onPress={onPress}>
    <Ionicons name="help-circle" size={28} color={colors.textOnPrimary} />
  </TouchableOpacity>
);

// ==========================================
// MAIN SCREEN
// ==========================================

export default function ARScreen({ route, navigation }) {
  const { imageUri, arElements, itemId } = route.params || {};
  const { history, addMessageToItem } = useHistory();
  const currentItem = history.find(i => i.id === itemId);

  const [selectedElement, setSelectedElement] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef();

  useEffect(() => {
    if (currentItem?.messages?.length > 0) {
      setMessages(currentItem.messages);
    } else {
      setMessages([{ 
        id: '0', 
        sender: 'bot', 
        text: 'Welcome! 👋 Tap any component in the diagram to learn more about it. I\'m here to answer your questions!',
        timestamp: Date.now()
      }]);
    }
  }, [currentItem?.messages]);

  if (!imageUri || imageUri.toLowerCase().includes('.pdf')) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={styles.errorTitle}>Unsupported Format</Text>
        <Text style={styles.errorText}>
          Interactive visualization requires PNG or JPG images.{'\n'}PDF files are not supported.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBoxPress = (el) => {
    if (selectedElement?.id === el.id) {
      setSelectedElement(null);
      setIsChatOpen(false);
    } else {
      setSelectedElement(el);
    }
  };

  const openChatForElement = () => {
    setIsChatOpen(true);
    if (selectedElement) {
      setInputText(`Tell me about the ${selectedElement.label}`);
    }
  };

  const sendMessage = () => {
    if (!inputText.trim()) return;
    
    const userMsg = { 
      id: Date.now().toString(), 
      sender: 'user', 
      text: inputText.trim(), 
      timestamp: Date.now() 
    };
    addMessageToItem(itemId, userMsg);
    setInputText('');
    setIsTyping(true);
    Keyboard.dismiss();

    setTimeout(() => {
      setIsTyping(false);
      const botMsg = { 
        id: (Date.now() + 1).toString(), 
        sender: 'bot', 
        text: `The ${selectedElement?.label || 'component'} is an essential part of this system. It ${selectedElement?.description || 'serves a critical function in the overall architecture'}. Would you like more specific details?`,
        timestamp: Date.now() 
      };
      addMessageToItem(itemId, botMsg);
    }, 1500);
  };

  const expandToFullChat = () => {
    setIsChatOpen(false);
    navigation.navigate('ChatFull', { chatId: itemId });
  };

  const showQuickHelp = () => {
    setIsChatOpen(true);
    const helpMessage = {
      id: Date.now().toString(),
      sender: 'bot',
      text: '💡 Quick Tips:\n\n• Tap any highlighted component to select it\n• Pinch to zoom in/out on the diagram\n• Drag with one finger to pan around\n• Use the "Ask Questions" button to start a conversation\n• I can explain functionality, connections, and specifications!',
      timestamp: Date.now()
    };
    addMessageToItem(itemId, helpMessage);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      
      {/* Interactive Diagram Viewer */}
      <InteractiveDiagramViewer
        imageUri={imageUri}
        arElements={arElements}
        onBoxPress={handleBoxPress}
        selectedElementId={selectedElement?.id}
      />

      {/* UI OVERLAY */}
      <View style={styles.uiOverlay} pointerEvents="box-none">
        
        {/* Header */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={colors.textOnPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Interactive Diagram</Text>
            <Text style={styles.headerSubtitle}>Zoom & Explore</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Component Info Card */}
        {selectedElement && !isChatOpen && (
          <ComponentInfoCard
            selectedElement={selectedElement}
            onOpenChat={openChatForElement}
            onClose={() => setSelectedElement(null)}
          />
        )}

        {/* Chat Interface */}
        {isChatOpen && (
          <ChatInterface
            title={selectedElement?.label || 'General Chat'}
            onClose={() => setIsChatOpen(false)}
            onExpand={expandToFullChat}
            messages={messages}
            inputText={inputText}
            setInputText={setInputText}
            onSend={sendMessage}
            scrollViewRef={scrollViewRef}
            isTyping={isTyping}
          />
        )}

        {/* Help FAB */}
        {!selectedElement && !isChatOpen && (
          <QuickHelpButton onPress={showQuickHelp} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F1419' 
  },
  
  uiOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    zIndex: 10 
  },
  
  viewerContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    justifyContent: 'center',
    alignItems: 'center',
  },

  instructionsOverlay: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: colors.primaryFaded,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.xl,
    zIndex: 5,
  },

  instructionText: {
    color: colors.primaryLight,
    fontSize: 13,
    fontWeight: '500',
  },

  diagramWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },

  componentLabelBadge: {
    position: 'absolute',
    bottom: -25,
    left: 0,
    right: 0,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
  },

  componentLabelText: {
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '600',
  },

  selectedPulse: {
    position: 'absolute',
    top: -12,
    right: -12,
    backgroundColor: 'rgba(255, 183, 77, 0.2)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFB74D',
  },
  
  // Zoom Controls
  zoomControls: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    flexDirection: 'column',
    backgroundColor: 'rgba(26, 31, 38, 0.95)',
    borderRadius: radii.lg,
    padding: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primaryFaded,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  resetButton: {
    backgroundColor: '#8B92A0',
  },

  zoomIndicator: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.primaryFaded,
    borderRadius: radii.md,
    alignItems: 'center',
  },

  zoomText: {
    color: colors.primaryLight,
    fontSize: 13,
    fontWeight: '700',
  },
  
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(15, 20, 25, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryFaded,
  },
  headerTitle: {
    color: colors.textOnPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
  },

  infoCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#1A1F26',
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primaryFaded,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  componentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCardLabel: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoCardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoCardDescription: {
    color: '#8B92A0',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 146, 160, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCardActions: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  primaryAction: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },

  chatContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: '#1A1F26',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  chatHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(139, 146, 160, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.primaryFaded,
  },
  chatHeaderLabel: {
    color: colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  chatHeaderTitle: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  chatHeaderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  chatScroll: {
    flex: 1,
  },
  chatScrollContent: {
    padding: 16,
  },
  messageBubble: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  botMessage: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  userBubbleContent: {
    maxWidth: '75%',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.xl,
    borderBottomRightRadius: 4,
  },
  botBubbleContent: {
    maxWidth: '75%',
    backgroundColor: '#242B34',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.xl,
    borderBottomLeftRadius: 4,
  },
  userMessageText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  botMessageText: {
    color: '#E8EAED',
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  botMessageTime: {
    color: 'rgba(232, 234, 237, 0.5)',
    fontSize: 11,
    marginTop: 6,
  },
  typingIndicator: {
    flexDirection: 'row',
    backgroundColor: '#242B34',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: radii.xl,
    borderBottomLeftRadius: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
    marginHorizontal: 3,
  },
  chatInputWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    backgroundColor: '#1A1F26',
    borderTopWidth: 1,
    borderTopColor: colors.primaryFaded,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#242B34',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.primaryFaded,
  },
  chatInput: {
    flex: 1,
    color: colors.textOnPrimary,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: colors.primaryFaded,
  },

  helpFab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },

  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    color: colors.error,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    color: '#8B92A0',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  errorButtonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});