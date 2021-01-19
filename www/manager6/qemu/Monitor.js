Ext.define('PVE.qemu.Monitor', {
    extend: 'Ext.panel.Panel',

    alias: 'widget.pveQemuMonitor',

    maxLines: 500,

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var history = [];
	var histNum = -1;
	var lines = [];

	var textbox = Ext.createWidget('panel', {
	    region: 'center',
	    xtype: 'panel',
	    autoScroll: true,
	    border: true,
	    margins: '5 5 5 5',
	    bodyStyle: 'font-family: monospace;',
	});

	var scrollToEnd = function() {
	    var el = textbox.getTargetEl();
	    var dom = Ext.getDom(el);

	    var clientHeight = dom.clientHeight;
	    // BrowserBug: clientHeight reports 0 in IE9 StrictMode
            // Instead we are using offsetHeight and hardcoding borders
            if (Ext.isIE9 && Ext.isStrict) {
		clientHeight = dom.offsetHeight + 2;
            }
	    dom.scrollTop = dom.scrollHeight - clientHeight;
	};

	var refresh = function() {
	    textbox.update('<pre>' + lines.join('\n') + '</pre>');
	    scrollToEnd();
	};

	var addLine = function(line) {
	    lines.push(line);
	    if (lines.length > me.maxLines) {
		lines.shift();
	    }
	};

	var executeCmd = function(cmd) {
	    addLine("# " + Ext.htmlEncode(cmd));
	    if (cmd) {
		history.unshift(cmd);
		if (history.length > 20) {
		    history.splice(20);
		}
	    }
	    histNum = -1;

	    refresh();
	    Proxmox.Utils.API2Request({
		params: { command: cmd },
		url: '/nodes/' + nodename + '/qemu/' + vmid + "/monitor",
		method: 'POST',
		waitMsgTarget: me,
		success: function(response, opts) {
		    var res = response.result.data;
		    Ext.Array.each(res.split('\n'), function(line) {
			addLine(Ext.htmlEncode(line));
		    });
		    refresh();
		},
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
	    });
	};

	Ext.apply(me, {
	    layout: { type: 'border' },
	    border: false,
	    items: [
		textbox,
		{
		    region: 'south',
		    margins:'0 5 5 5',
		    border: false,
		    xtype: 'textfield',
		    name: 'cmd',
		    value: '',
		    fieldStyle: 'font-family: monospace;',
		    allowBlank: true,
		    listeners: {
			afterrender: function(f) {
			    f.focus(false);
			    addLine("Type 'help' for help.");
			    refresh();
			},
			specialkey: function(f, e) {
			    var key = e.getKey();
			    switch (key) {
				case e.ENTER:
				    var cmd = f.getValue();
				    f.setValue('');
				    executeCmd(cmd);
				    break;
				case e.PAGE_UP:
				    textbox.scrollBy(0, -0.9*textbox.getHeight(), false);
				    break;
				case e.PAGE_DOWN:
				    textbox.scrollBy(0, 0.9*textbox.getHeight(), false);
				    break;
				case e.UP:
				    if (histNum + 1 < history.length) {
					f.setValue(history[++histNum]);
				    }
				    e.preventDefault();
				    break;
				case e.DOWN:
				    if (histNum > 0) {
					f.setValue(history[--histNum]);
				    }
				    e.preventDefault();
				    break;
				default:
				    break;
			    }
			},
		    },
		},
	    ],
	    listeners: {
		show: function() {
		    var field = me.query('textfield[name="cmd"]')[0];
		    field.focus(false, true);
		},
	    },
	});

	me.callParent();
    },
});
