import { useEffect, useRef, useState } from 'react';
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
import { registerUser } from '../services/api';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function RegisterScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);

  // Rensar lösenorden och avbryter anropet när skärmen lämnas.
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      request.current?.abort();
      request.current = null;
      setLoading(false);
      setPassword('');
      setConfirmPassword('');
      setRegistered(false);
      setError('');
    });

    return () => {
      unsubscribe();
      request.current?.abort();
    };
  }, [navigation]);

  async function handleRegister() {
    // Stoppar flera registreringar från snabba knapptryck.
    if (request.current) {
      return;
    }
    // Kontrollerar formuläret innan uppgifterna skickas till servern.
    if (
      !username.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Fyll i alla fält.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Lösenorden matchar inte.');
      return;
    }
    if (password.trim().length < 8) {
      setError('Lösenordet måste innehålla minst 8 tecken.');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    Keyboard.dismiss();

    try {
      await registerUser(
        { username, email, password },
        { signal: controller.signal }
      );

      // Registrering skapar kontot. Användaren får sedan logga in själv.
      if (!controller.signal.aborted) {
        setRegistered(true);
        setPassword('');
        setConfirmPassword('');
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

  let content;

  if (registered) {
    content = (
      <View>
        <Text style={styles.message} accessibilityLiveRegion="polite">
          Kontot har skapats. Du kan nu logga in.
        </Text>
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Till inloggningen</Text>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <View>
        <Text style={styles.label}>Användarnamn</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          accessibilityLabel="Användarnamn"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
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
        <Text style={styles.label}>Lösenord (minst 8 tecken)</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Lösenord, minst 8 tecken"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          editable={!loading}
        />
        <Text style={styles.label}>Bekräfta lösenord</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          accessibilityLabel="Bekräfta lösenord"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
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
            accessibilityLabel="Registrerar konto"
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
          onPress={handleRegister}
        >
          <Text style={styles.buttonText}>Registrera konto</Text>
        </Pressable>
        <Pressable
          style={styles.link}
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.linkText}>Tillbaka till inloggning</Text>
        </Pressable>
      </View>
    );
  }

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
        <Text style={globalStyles.title}>Registrera konto</Text>
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
