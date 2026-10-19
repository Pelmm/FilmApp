import { useContext, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
import MyReviewsScreen from '../screens/MyReviewsScreen';
import ReviewEditorScreen from '../screens/ReviewEditorScreen';
import { AuthContext } from '../context/AuthContext';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, restoring, message, canRetry, retryRestore } = useContext(AuthContext);
  const navigationRef = useNavigationContainerRef();
  const [currentScreen, setCurrentScreen] = useState('Home');

  function updateCurrentScreen() {
    // Används för att markera rätt knapp i den nedersta navigationsraden.
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

  function openMyReviews() {
    // Utloggade användare får först öppna inloggningen.
    if (isAuthenticated) {
      openScreen('MyReviews');
    } else {
      openScreen('Login');
    }
  }

  const homeSelected = currentScreen === 'Home';
  const searchSelected = currentScreen === 'Search';
  const reviewsSelected = ['Login', 'Register', 'MyReviews', 'ReviewEditor'].includes(currentScreen);

  // Väntar på den sparade sessionen innan skärmarna visas.
  if (restoring) {
    return (
      <View style={globalStyles.placeholderContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={globalStyles.text}>Återställer inloggningen...</Text>
      </View>
    );
  }

  // Skyddade skärmar finns bara i navigatorn medan användaren är inloggad.
  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={updateCurrentScreen}
      onStateChange={updateCurrentScreen}
    >
      <View style={globalStyles.container}>
        {message !== '' && (
          <View style={styles.sessionMessage}>
            <Text style={globalStyles.text} accessibilityLiveRegion="polite">
              {message}
            </Text>
            {canRetry && (
              <Pressable
                style={styles.retryButton}
                accessibilityRole="button"
                onPress={retryRestore}
              >
                <Text style={[styles.label, styles.selected]}>Försök igen</Text>
              </Pressable>
            )}
          </View>
        )}
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
            {isAuthenticated ? (
              <>
                <Stack.Screen
                  name="MyReviews"
                  component={MyReviewsScreen}
                  options={{ title: 'Mina recensioner' }}
                />
                <Stack.Screen
                  name="ReviewEditor"
                  component={ReviewEditorScreen}
                  options={{ title: 'Recension' }}
                />
              </>
            ) : (
              <>
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
              </>
            )}
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
              onPress={openMyReviews}
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
  retryButton: {
    minHeight: 48,
    padding: 12,
    justifyContent: 'center',
  },

  sessionMessage: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

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
