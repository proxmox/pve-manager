Ext.define('PVE.ceph.Log', {
    extend: 'Proxmox.panel.LogView',
    xtype: 'cephLogView',
    nodename: undefined,
    doAttemptLoad: function(start) {
        var me = this;

	var req_params = {
	    start: start,
	    limit: me.pageSize
	};

	if (me.log_select_timespan) {
	    // always show log until the end of the selected day
	    req_params.until = Ext.Date.format(me.until_date, 'Y-m-d') + ' 23:59:59';
	    req_params.since = Ext.Date.format(me.since_date, 'Y-m-d');
	}

	Proxmox.Utils.API2Request({
	    url: me.url,
	    params: req_params,
	    method: 'GET',
	    success: function(response) {
		Proxmox.Utils.setErrorMask(me, false);
		var list = response.result.data;
		var total = response.result.total;
		var first = 0, last = 0;
		var text = '';
		Ext.Array.each(list, function(item) {
		    if (!first|| item.n < first) {
			first = item.n;
		    }
		    if (!last || item.n > last) {
			last = item.n;
		    }
		    text = text + Ext.htmlEncode(item.t) + "<br>";
		});

		if (first && last && total) {
		    me.updateView(first -1 , last -1, total, text);
		} else {
		    me.updateView(0, 0, 0, '');
		}
	    },
	    failure: function(response) {
		var msg = response.htmlStatus;
		var windowShow = PVE.Utils.showCephInstallOrMask(me, msg, me.nodename,
		    function(win){
			me.mon(win, 'cephInstallWindowClosed', function(){
			    me.doAttemptLoad(0);
			});
		    }
		);
		if (!windowShow) {
		    Proxmox.Utils.setErrorMask(me, msg);
		}
	    }
	});
    }
});