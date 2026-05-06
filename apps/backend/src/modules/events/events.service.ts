import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

export interface CaixaPaymentEvent {
  numeroordem: string;
  idVenda: number;
  timestamp: string;
}

@Injectable()
export class EventsService {
  private readonly subject = new Subject<CaixaPaymentEvent>();

  emitCaixaPayment(data: CaixaPaymentEvent): void {
    this.subject.next(data);
  }

  getCaixaPaymentStream(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const sub = this.subject.subscribe({
        next: (data) => subscriber.next({ data } as MessageEvent),
        error: (err) => subscriber.error(err),
      });
      return () => sub.unsubscribe();
    });
  }
}
