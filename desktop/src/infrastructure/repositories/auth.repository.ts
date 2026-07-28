import { http } from '@/core/api/http-client';
import { loginResponseSchema, meResponseSchema, type LoginInput } from '@/domain/schemas/auth';
import { okResponse } from '@/domain/schemas/common';
import { tokenService } from '@/core/auth/token.service';
import type { AuthRepository } from '@/domain/repositories/ports';

export const authRepository: AuthRepository = {
  async login(input: LoginInput) {
    const data = await http.post('/auth/login', {
      email: input.email.trim().toLowerCase(),
      password: input.password,
      device: 'desktop',
    }, {
      schema: loginResponseSchema,
      anonymous: true,
    });

    return {
      user: data.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
  },

  async me() {
    const data = await http.get('/auth/me', { schema: meResponseSchema });
    return data.user;
  },

  async logout() {
    const refreshToken = tokenService.getRefreshToken();
    if (refreshToken) {
      // A failed logout must not trap the user in a session they want to leave;
      // clearing the local tokens is what actually ends the session for them.
      await http.post('/auth/logout', { refreshToken }, { schema: okResponse }).catch(() => undefined);
    }
    await tokenService.clear();
  },
};
