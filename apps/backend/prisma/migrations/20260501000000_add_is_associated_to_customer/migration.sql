-- AddColumn isAssociated to Customer
ALTER TABLE "Customer" ADD COLUMN "isAssociated" BOOLEAN NOT NULL DEFAULT false;
