"use strict";
var repo = require("../repos/faucetRepo");
var logRepo = require("../repos/logRepo");
var smartholdemApi = require("sth-api");
var moment = require("moment");
var util = require("../util");

var createLog = (IP, address, amount, rollTime) => {
    var log = {
        IP: IP,
        address: address,
        amount: amount,
        rollTime: rollTime
    };

    console.log(`[${rollTime}] ${address} (${IP}) +${PAY_PER_CLICK} STH`);
    return log;
};

var timeDiff = (now, lastRollTime, cooldown) => {
    var diff = now.diff(lastRollTime, "seconds");
    return { canRoll: diff > cooldown, diff: diff };
};

exports.useFaucet = (req, res) => {
    var address = req.body.address;
    console.log("post address:"+address);
    console.log("isaddr:"+util.isAddress(address));
    if(!util.isAddress(address)) {
	    return util.reject(res, "400", "Invalid STH address");
    }
    recaptcha.verify(req, (err, data) => {
        if(!err)
        {
            var IP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            console.log(IP);
            var now = moment();

            smartholdemApi.getBalance(FAUCET_ADDR, (err, succ, resp) => {
                if(!err)
                {
                    var faucetBalance = resp.balance / 100000000;
                    var sumUnpaidBalancesP = repo.sumUnpaidBalance();
                    var lastRollTimeP = repo.getRollTimeByIp(IP);

                    Promise.all([sumUnpaidBalancesP, lastRollTimeP]).then((resp) => {
                        var totalUnpaid = resp[0].sum;
                        var rollTimeRow = resp[1];

                        var timeDifference = { canRoll:true, diff: 0 };

                        //Check if cooldown is up
                        if(rollTimeRow.length > 0)
                        {
                            timeDifference = timeDiff(now, moment(rollTimeRow[0].lastRoll), COOLDOWN);
                            if(!timeDifference.canRoll)
                                return util.reject(res, "403", "Try again later");
                        }

                        //Make sure we don't become insolvent
                        if(totalUnpaid + PAY_PER_CLICK >= faucetBalance)
                            return util.reject(res, "403", "Faucet is empty, please check back later");

                        //Checks passed, credit them now
                        var updatePendingP = repo.updateUnpaidBalance(address, PAY_PER_CLICK);
                        var updateRollTimeP = repo.updateRollTime(IP, now.toDate());

                        logRepo.addLog(createLog(IP, address, PAY_PER_CLICK, now.toDate()));
                        Promise.all([updatePendingP, updateRollTimeP]).then(() => {
                            return res.send({
                                timeDiff: timeDifference.diff
                            });
                        });
                    });
                }
                else
                    reject(err);
            });
        }
        else
            util.reject(res, "403", "reCaptcha verification failed");
    })
};

exports.getStatus = (req, res) => {
    var IP = req.connection.remoteAddress;

    repo.getRollTimeByIp(IP).then((resp) => {
        if(resp.length == 0)
            return res.send({canRoll: true});

        var lastRollTime = moment(resp[0].lastRoll);
        var timeDifference = timeDiff(moment(), lastRollTime, COOLDOWN);
        if(timeDifference.canRoll)
            return res.send({canRoll: true});
        else
            return res.send({canRoll: false, timeDiff: timeDifference.diff});
    });
};

exports.getInfo = (req, res) => {
    var faucetInfo = {
        address: FAUCET_ADDR,
        payPerClick: PAY_PER_CLICK,
        cooldown: COOLDOWN
    };

    console.log(faucetInfo);
    res.send(faucetInfo);
};

exports.getRecentLogs = (req, res) => {
    logRepo.getRecentLogs(10).then((logs) => {
        res.send(logs);
    });
};

exports.getCaptcha = (req, res) => {
    res.send({ captcha: recaptcha.render() });
};
