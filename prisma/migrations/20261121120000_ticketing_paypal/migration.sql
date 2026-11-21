-- AlterTable
ALTER TABLE `ticketing_payments` MODIFY `method` ENUM('WERO', 'REVOLUT', 'PAYPAL', 'TRANSFER', 'CASH', 'CHEQUE') NOT NULL;

-- AlterTable
ALTER TABLE `ticketing_onsite_sales` MODIFY `method` ENUM('WERO', 'REVOLUT', 'PAYPAL', 'TRANSFER', 'CASH', 'CHEQUE') NOT NULL;
