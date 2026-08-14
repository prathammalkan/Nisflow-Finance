import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import Decimal from 'decimal.js';
import Link from 'next/link';

interface PersonCardProps {
  person: any;
}

export function PersonCard({ person }: PersonCardProps) {
  const amountOwedBy = new Decimal(person.amount_owed_by || 0);
  const amountOwedTo = new Decimal(person.amount_owed_to || 0);
  const thirdPartyHeld = new Decimal(person.third_party_held || 0);
  
  const netOwed = amountOwedBy.minus(amountOwedTo);

  return (
    <Link href={`/people/${person.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg">{person.name}</CardTitle>
            <Badge variant="outline">{person.relationship || 'Other'}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {netOwed.gt(0) && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Owes you</span>
                <span>{formatINR(netOwed.toNumber())}</span>
              </div>
            )}
            {netOwed.lt(0) && (
              <div className="flex justify-between text-red-600 font-medium">
                <span>You owe</span>
                <span>{formatINR(netOwed.abs().toNumber())}</span>
              </div>
            )}
            {netOwed.eq(0) && (
              <div className="flex justify-between text-muted-foreground">
                <span>Settled</span>
                <span>{formatINR(0)}</span>
              </div>
            )}
            
            {thirdPartyHeld.gt(0) && (
              <div className="flex justify-between text-amber-600 pt-1 border-t">
                <span>3rd Party Held</span>
                <span>{formatINR(thirdPartyHeld.toNumber())}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
