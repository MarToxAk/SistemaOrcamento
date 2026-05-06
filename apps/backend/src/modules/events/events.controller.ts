import { Controller, Sse } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Observable } from "rxjs";

import { Public } from "../security/public.decorator";
import { EventsService } from "./events.service";

@Controller("events")
@SkipThrottle()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Sse("pagamentos")
  streamPagamentos(): Observable<MessageEvent> {
    return this.eventsService.getCaixaPaymentStream();
  }
}
