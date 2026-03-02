import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useDocumentContext } from '@ar-viewer/shared';

import UploadScreen from '../screens/UploadScreen';
import DiagramScreen from '../screens/DiagramScreen';
import ComponentsScreen from '../screens/ComponentScreen';
import ChatScreen from '../screens/ChatScreen';
import ARMockScreen from '../mocks/ARMockScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { document } = useDocumentContext();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={document ? 'Diagram' : 'Upload'}
        screenOptions={{
          headerStyle: { backgroundColor: '#667eea' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen
          name="Upload"
          component={UploadScreen}
          options={{ title: '📤 Upload Diagram' }}
        />
        <Stack.Screen
          name="Diagram"
          component={DiagramScreen}
          options={{ title: '📐 AR View' }}
        />
        <Stack.Screen
          name="Components"
          component={ComponentsScreen}
          options={{ title: '🔍 Components' }}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{ title: '💬 AI Chat' }}
        />
        <Stack.Screen
          name="ARMock"
          component={ARMockScreen}
          options={{ title: '🧊 AR Mock Preview' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}