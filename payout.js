var repo = require("./api/repos/faucetRepo");
var smartholdemApi = require("sthjs-wrapper");
var moment = require("moment");
var BigNumber = require("bignumber.js");
var scheduler = require("node-schedule");
var util = require("./api/util");

var doPayout = (threshold, fee, passphrase, secondPassphrase) => {
    util.log("==Payout Begin==");
    util.log("DateTime: " + moment().toISOString());
    util.log("Getting pending balances...");

    repo.getOverthresholdBalances(threshold).then((balances) => {
        if(balances.length == 0)
            return;

        var options = { secondPassphrase: secondPassphrase, vendorField: 'devfaucet.smartholdem.io', version: 0x1e };

        var addrs = balances.map((bal) => bal.address);

        var txs = balances.map((bal) => {
            var payout = new BigNumber(bal.pending).times(100000000); //convert to satoshis
            var txFee = new BigNumber(fee).times(100000000);
            payout = payout.minus(txFee);

            console.log(bal.address, payout.toNumber(), options);
            var tx = smartholdemApi.createTransaction(passphrase, bal.address, payout.toNumber(), options);
            //console.log("tx:"+tx);
            var logMsg = bal.address + " " + parseFloat(bal.pending) + " " + tx.id;
            util.log(logMsg);
            
            return tx;
        });

        repo.deleteUnpaidBalances(addrs);

        var txBundles = [];
        while(txs.length)
            txBundles.push(txs.splice(0, 10));

        util.log("Paying now...");
        var i = 0;
        function queuePayments()
        {
            var bundle = txBundles[i];
            util.log(`Sending tx bundle ${i+1}/${txBundles.length}`);
            smartholdemApi.sendTransactions(bundle);
            i++;
            if(i < txBundles.length)
                setTimeout(queuePayments, 5000);
            else
                util.log("==Payout Complete==");
        }
        queuePayments();
    });
};

exports.startScheduler = (threshold, fee, cronJob, passphrase, secondPassphrase) => {
    console.log(`Automatic payouts scheduled: ${cronJob}`);
    var paySchedule = scheduler.scheduleJob(cronJob, () => {
        doPayout(threshold, fee, passphrase, secondPassphrase);
    });
};
