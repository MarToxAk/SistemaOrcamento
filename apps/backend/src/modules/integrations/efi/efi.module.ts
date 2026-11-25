import { Module, forwardRef } from '@nestjs/common';
import { EfiController } from './efi.controller';
import { EfiService } from './efi.service';
import { PixComprovanteService } from './pix-comprovante.service';
import { QuotesModule } from '../../quotes/quotes.module';
import { ChatwootModule } from '../chatwoot/chatwoot.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    forwardRef(() => QuotesModule),
    forwardRef(() => ChatwootModule),
    DatabaseModule,
  ],
  controllers: [EfiController],
  providers: [EfiService, PixComprovanteService],
  exports: [EfiService],
})
export class EfiModule {}
