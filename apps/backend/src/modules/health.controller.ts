import { Controller, Get } from "@nestjs/common";

import { Public } from "./security/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "bomcusto-backend",
      now: new Date().toISOString(),
    };
  }
}
