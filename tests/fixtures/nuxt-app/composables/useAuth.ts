export const useAuth = () => {
  const user = useState<{ id: number; email: string; name: string } | null>('auth-user', () => null);
  const isAuthenticated = computed(() => !!user.value);

  const login = async (email: string, password: string) => {
    const data = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    user.value = data.user;
  };

  const logout = async () => {
    await $fetch('/api/auth/logout', { method: 'POST' });
    user.value = null;
    navigateTo('/login');
  };

  return {
    user: readonly(user),
    isAuthenticated,
    login,
    logout,
  };
};
