import { Controller, Get, Query } from "@nestjs/common";

import { PdvService } from "./pdv.service";

@Controller("integrations/pdv")
export class PdvController {
  constructor(private readonly pdvService: PdvService) {}

  @Get("health")
  async health() {
    return this.pdvService.getConnectionInfo();
  }

  @Get("customers")
  async searchCustomers(@Query("q") query?: string) {
    return this.pdvService.searchCustomer(query ?? "");
  }
}
