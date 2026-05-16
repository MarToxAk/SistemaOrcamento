import { Controller, Sse } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Observable } from "rxjs";

import { EventsService } from "./events.service";

@Controller("events")
@SkipThrottle()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse("pagamentos")
  streamPagamentos(): Observable<MessageEvent> {
    return this.eventsService.getCaixaPaymentStream();
  }
}
