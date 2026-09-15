/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

declare namespace App {
  interface Locals {
    user: { id: number; email: string; name: string | null } | null;
  }
}
