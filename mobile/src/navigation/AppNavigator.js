import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0b1020' },
          headerTintColor: '#f5f7fb',
          contentStyle: { backgroundColor: '#0b1020' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'FilmApp' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
