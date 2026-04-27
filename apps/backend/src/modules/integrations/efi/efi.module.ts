import { Module, forwardRef } from '@nestjs/common';
import { EfiService } from './efi.service';
import { QuotesModule } from '../../quotes/quotes.module';
import { ChatwootModule } from '../chatwoot/chatwoot.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    forwardRef(() => QuotesModule),
    forwardRef(() => ChatwootModule),
    DatabaseModule,
  ],
  providers: [EfiService],
  exports: [EfiService],
})
export class EfiModule {}
