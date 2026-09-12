import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  /**
   * Service identity. `/healthz` belongs to HealthModule, which reports what
   * actually works — see modules/health.
   */
  @Get()
  root() {
    return {
      service: 'pixstock-relayer',
      docs: 'https://github.com/PixStock/pixstock/blob/main/docs/ARCHITECTURE.md',
      health: '/healthz',
    };
  }
}
