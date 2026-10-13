import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import MovieDetailsScreen from '../screens/MovieDetailsScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const navigationRef = useNavigationContainerRef();
  const [currentScreen, setCurrentScreen] = useState('Home');

  function updateCurrentScreen() {
    const route = navigationRef.getCurrentRoute();
    if (route) {
      setCurrentScreen(route.name);
    }
  }

  function openScreen(name) {
    if (navigationRef.isReady()) {
      navigationRef.navigate(name);
    }
  }

  const homeSelected = currentScreen === 'Home';
  const searchSelected = currentScreen === 'Search';
  const reviewsSelected = currentScreen === 'Login' || currentScreen === 'Register';

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={updateCurrentScreen}
      onStateChange={updateCurrentScreen}
    >
      <View style={styles.container}>
        <View style={styles.screenArea}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: '#0b1020' },
              headerTintColor: '#f5f7fb',
              contentStyle: { backgroundColor: '#0b1020' },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'FilmApp' }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Sök filmer' }} />
            <Stack.Screen name="MovieDetails" component={MovieDetailsScreen} options={{ title: 'Filmdetaljer' }} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Logga in' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Registrera konto' }} />
            {/* MyReviewsScreen registreras först när riktig autentisering finns. */}
          </Stack.Navigator>
        </View>

        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bottomArea}>
          <View style={styles.navigationRow}>
            <Pressable
              style={styles.navigationButton}
              accessibilityRole="button"
              accessibilityState={{ selected: homeSelected }}
              onPress={() => openScreen('Home')}
            >
              <Text style={[styles.label, homeSelected && styles.selected]}>Hem</Text>
            </Pressable>
            <Pressable
              style={styles.navigationButton}
              accessibilityRole="button"
              accessibilityState={{ selected: searchSelected }}
              onPress={() => openScreen('Search')}
            >
              <Text style={[styles.label, searchSelected && styles.selected]}>Sök</Text>
            </Pressable>
            <Pressable
              style={styles.navigationButton}
              accessibilityRole="button"
              accessibilityState={{ selected: reviewsSelected }}
              onPress={() => openScreen('Login')}
            >
              <Text style={[styles.label, reviewsSelected && styles.selected]}>Mina recensioner</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020' },
  // Stacken får återstående höjd; navigationsraden får behålla sin egen höjd.
  screenArea: { flex: 1 },
  bottomArea: { flexShrink: 0, backgroundColor: '#0b1020', borderTopWidth: 1, borderTopColor: '#263249' },
  navigationRow: { flexDirection: 'row' },
  navigationButton: { flex: 1, minHeight: 52, padding: 8, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#c0cadb', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  selected: { color: '#f5c563' },
});
