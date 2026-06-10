-- Add releasedAmount column to financial_payments for partial release support
ALTER TABLE `financial_payments`
  ADD COLUMN `releasedAmount` DECIMAL(10, 2) NULL AFTER `releasedAt`;
