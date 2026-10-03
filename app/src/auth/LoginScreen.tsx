import { Pressable, Text, View } from 'react-native';
import { tokens } from '../ui/tokens';
import { getSupabase } from './supabase';

const signIn = (provider: 'google' | 'apple') =>
  getSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });

export function LoginScreen() {
  const button = { paddingVertical: 10, paddingHorizontal: 16, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.panel, minWidth: 240, alignItems: 'center' as const };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: tokens.color.bg }}>
      <Text style={{ fontSize: tokens.font.size.lg, fontWeight: '600', marginBottom: 8 }}>Personal Sprint</Text>
      <Pressable style={button} onPress={() => signIn('google')}><Text>Continue with Google</Text></Pressable>
      <Pressable style={button} onPress={() => signIn('apple')}><Text>Continue with Apple</Text></Pressable>
    </View>
  );
}
