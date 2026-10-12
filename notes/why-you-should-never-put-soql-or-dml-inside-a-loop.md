This is one of the most common questions in a Salesforce developer interview. The short answer is "governor limits", but a good answer explains what actually goes wrong.

## The question

"Why is it a bad practice to write a SOQL query or a DML statement inside a for loop?"

## The short answer

Salesforce limits how much one transaction can do. In a synchronous transaction you get 100 SOQL queries and 150 DML statements. A trigger can receive up to 200 records at a time. If your code runs one query per record, 200 records means 200 queries, and the transaction fails.

## Code that breaks

```apex
for (Account acc : Trigger.new) {
    List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
    for (Contact c : contacts) {
        c.Description = 'Updated';
        update c;
    }
}
```

This works when you test it with one record. It fails when a data load sends 200 accounts, because the query runs 200 times.

## The fix

Collect the Ids first, run one query, change the records in memory, and run one update.

```apex
Set<Id> accountIds = new Set<Id>();
for (Account acc : Trigger.new) {
    accountIds.add(acc.Id);
}

List<Contact> contacts = [ SELECT Id, Description FROM Contact WHERE AccountId IN :accountIds ];

for (Contact c : contacts) {
    c.Description = 'Updated';
}

update contacts;
```

Now the code uses one query and one DML statement, whether it receives 1 record or 200.

## What the interviewer wants to hear

- You know the limits are per transaction, not per record.
- You always write code for many records, not for one.
- You know the pattern: collect, query once, update once.

## The same rule applies to Flows

A Get Records or Update Records element inside a Flow loop has the same problem. Move it outside the loop and use a collection.
