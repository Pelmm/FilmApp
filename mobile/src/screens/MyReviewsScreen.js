import { useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import colors from '../styles/colors';
import fonts from '../styles/fonts';
import globalStyles from '../styles/globalStyles';

export default function MyReviewsScreen() {
  const { user, signOut } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogout() {
    if (loading) {
      return;
    }
    setLoading(true);
    setError('');

    try {
      await signOut();
      // Navigatorn tar automatiskt bort skärmen när sessionen rensas.
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <View style={globalStyles.placeholderContainer}>
      <Text style={globalStyles.title}>Mina recensioner</Text>
      <Text style={globalStyles.text}>Inloggad som {user?.username}.</Text>
      <Text style={globalStyles.text}>Recensioner kommer i nästa steg.</Text>
      {error !== '' && (
        <Text style={styles.message} accessibilityLiveRegion="polite">{error}</Text>
      )}
      <Pressable
        style={[styles.button, loading && styles.disabledButton]}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        onPress={handleLogout}
      >
        <Text style={styles.buttonText}>Logga ut</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  buttonText: {
    color: colors.background,
    fontSize: fonts.sizes.normal,
    fontWeight: fonts.weights.bold,
  },

  disabledButton: {
    opacity: 0.5,
  },

  message: {
    color: colors.secondaryText,
    fontSize: fonts.sizes.normal,
    marginTop: 16,
  },
});
