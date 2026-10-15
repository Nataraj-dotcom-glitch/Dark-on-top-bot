/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                                                                  ║
 * ║   ░█▀▀░█▀█░█▀▄░█▀▀░█░█   ░█▀▄░█▀▀░█░█░█▀▀                     ║
 * ║   ░█░░░█░█░█░█░█▀▀░▄▀▄   ░█░█░█▀▀░▀▄▀░▀▀█                     ║
 * ║   ░▀▀▀░▀▀▀░▀▀░░▀▀▀░▀░▀   ░▀▀░░▀▀▀░░▀░░▀▀▀                     ║
 * ║                                                                  ║
 * ║           © 2026 CodeX Devs — All Rights Reserved               ║
 * ║                                                                  ║
 * ║   discord  ──  https://discord.gg/darkontop                      ║
 * ║   youtube  ──  https://youtube.com/@CodeXDevs                   ║
 * ║   github   ──  https://github.com/RayExo                        ║
 * ║                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import DiscordProvider from "next-auth/providers/discord";
import type { AuthOptions } from "next-auth";

export const authOptions: AuthOptions = {
  providers: [
    DiscordProvider({
  id: "discord",
  name: "Discord",

  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,

  authorization: {
    url: "https://discord.com/api/oauth2/authorize",
    params: {
      scope: "identify guilds",
    },
  },

  token: "https://discord.com/api/oauth2/token",
  userinfo: "https://discord.com/api/users/@me",

  profile(profile) {
    return {
      id: profile.id,
      name: profile.username,
      image: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null,
    };
  },
}),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },

  useSecureCookies:
    process.env.NODE_ENV === "production",

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.id = token.sub;

        // @ts-ignore
        session.accessToken = token.accessToken;
      }

      return session;
    },
  },

  pages: {
    signIn: "/",
  },
};
