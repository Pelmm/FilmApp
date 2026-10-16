import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function LoginScreen({ navigation }) {
  const { signIn } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      request.current?.abort();
      request.current = null;
      setLoading(false);
      setPassword('');
      setError('');
    });

    return () => {
      unsubscribe();
      request.current?.abort();
    };
  }, [navigation]);

  async function handleLogin() {
    if (request.current) {
      return;
    }
    if (!email.trim() || !password) {
      setError('Fyll i e-postadress och lösenord.');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    Keyboard.dismiss();

    try {
      await signIn(
        { email, password },
        { signal: controller.signal }
      );

      if (!controller.signal.aborted) {
        setPassword('');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error.message);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
  }

  const content = (
    <View>
      <Text style={styles.label}>E-postadress</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        accessibilityLabel="E-postadress"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={!loading}
      />
      <Text style={styles.label}>Lösenord</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        accessibilityLabel="Lösenord"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        editable={!loading}
      />
      {error !== '' && (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      {loading && (
        <ActivityIndicator
          style={styles.spinner}
          color={colors.accent}
          accessibilityLabel="Loggar in"
        />
      )}
      <Pressable
        style={[styles.button, loading && styles.disabledButton]}
        accessibilityRole="button"
        accessibilityState={{
          disabled: loading,
          busy: loading,
        }}
        disabled={loading}
        onPress={handleLogin}
      >
        <Text style={styles.buttonText}>Logga in</Text>
      </Pressable>
      <Pressable
        style={styles.link}
        accessibilityRole="button"
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={styles.linkText}>Registrera konto</Text>
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={globalStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={globalStyles.title}>Logga in</Text>
        {content}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 24,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    justifyContent: 'center',
  },

  label: {
    color: colors.primaryText,
    fontSize: fonts.sizes.normal,
    marginBottom: 8,
  },

  input: {
    backgroundColor: colors.card,
    color: colors.primaryText,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    minHeight: 48,
    padding: 12,
    fontSize: fonts.sizes.normal,
    marginBottom: 16,
  },

  message: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    lineHeight: 24,
    marginBottom: 16,
  },

  spinner: {
    marginBottom: 16,
  },

  button: {
    backgroundColor: colors.accent,
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
  },

  disabledButton: {
    opacity: 0.5,
  },

  link: {
    minHeight: 48,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  linkText: {
    color: colors.accent,
    fontSize: fonts.sizes.normal,
    textAlign: 'center',
  },
});
