import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  useNavigationContainerRef
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import MovieDetailsScreen from '../screens/MovieDetailsScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

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
      <View style={globalStyles.container}>
        <View style={styles.screenArea}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.primaryText,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'FilmApp' }}
            />
            <Stack.Screen
              name="Search"
              component={SearchScreen}
              options={{ title: 'Sök filmer' }}
            />
            <Stack.Screen
              name="MovieDetails"
              component={MovieDetailsScreen}
              options={{ title: 'Filmdetaljer' }}
            />
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ title: 'Logga in' }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ title: 'Registrera konto' }}
            />
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
  // Stacken får återstående höjd; navigationsraden får behålla sin egen höjd.
  screenArea: {
    flex: 1
  },

  bottomArea: {
    flexShrink: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },

  navigationRow: {
    flexDirection: 'row'
  },

  navigationButton: {
    flex: 1,
    minHeight: 52,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },

  label: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.small,
    fontWeight: fonts.weights.semibold,
    textAlign: 'center'
  },

  selected: {
    color: colors.accent
  },
});
