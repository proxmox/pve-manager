/*global Blob*/
Ext.define('PVE.node.SubscriptionKeyEdit', {
    extend: 'PVE.window.Edit',
    title: gettext('Upload Subscription Key'),
    width: 300,
    items: {
	xtype: 'textfield',
	name: 'key',
	value: '',
	fieldLabel: gettext('Subscription Key')
    },
    initComponent : function() {
	var me = this;

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.node.Subscription', {
    extend: 'PVE.grid.ObjectGrid',

    alias: ['widget.pveNodeSubscription'],

    onlineHelp: 'getting_help',

    viewConfig: {
	enableTextSelection: true
    },

    showReport: function() {
	var me = this;
	var nodename = me.pveSelNode.data.node;

	var getReportFileName = function() {
	    var now = Ext.Date.format(new Date(), 'D-d-F-Y-G-i');
	    return me.nodename + '-report-'  + now + '.txt';
	};

	var view = Ext.createWidget('component', {
	    itemId: 'system-report-view',
	    scrollable: true,
	    style: {
		'background-color': 'white',
		'white-space': 'pre',
		'font-family': 'monospace',
		padding: '5px'
	    }
	});

	var reportWindow = Ext.create('Ext.window.Window', {
	    title: gettext('System Report'),
	    width: 1024,
	    height: 600,
	    layout: 'fit',
	    modal: true,
	    buttons: [
		        '->',
			{
			    text: gettext('Download'),
			    handler: function() {
				var fileContent = reportWindow.getComponent('system-report-view').html;
				var fileName = getReportFileName();

				// Internet Explorer
				if (window.navigator.msSaveOrOpenBlob) {
				    navigator.msSaveOrOpenBlob(new Blob([fileContent]), fileName);
				} else {
				    var element = document.createElement('a');
				    element.setAttribute('href', 'data:text/plain;charset=utf-8,'
				      + encodeURIComponent(fileContent));
				    element.setAttribute('download', fileName);
				    element.style.display = 'none';
				    document.body.appendChild(element);
				    element.click();
				    document.body.removeChild(element);
				}
			    }
			}
		],
	    items: view
	});

	PVE.Utils.API2Request({
	    url: '/api2/extjs/nodes/' + me.nodename + '/report',
	    method: 'GET',
	    waitMsgTarget: me,
	    failure: function(response) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    success: function(response) {
		var report = Ext.htmlEncode(response.result.data);
		reportWindow.show();
		view.update(report);
	    }
	});
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	var reload = function() {
	    me.rstore.load();
	};

	var baseurl = '/nodes/' + me.nodename + '/subscription';

	var render_status = function(value) {

	    var message = me.getObjectValue('message');

	    if (message) {
		return value + ": " + message;
	    }
	    return value;
	};

	var rows = {
	    productname: {
		header: gettext('Type')
	    },
	    key: {
		header: gettext('Subscription Key')
	    },
	    status: {
		header: gettext('Status'),
		renderer: render_status
	    },
	    message: {
		visible: false
	    },
	    serverid: {
		header: gettext('Server ID')
	    },
	    sockets: {
		header: gettext('Sockets')
	    },
	    checktime: {
		header: gettext('Last checked'),
		renderer: PVE.Utils.render_timestamp
	    },
	    nextduedate: {
		header: gettext('Next due date')
	    }
	};

	Ext.apply(me, {
	    url: '/api2/json' + baseurl,
	    cwidth1: 170,
	    tbar: [ 
		{
		    text: gettext('Upload Subscription Key'),
		    handler: function() {
			var win = Ext.create('PVE.node.SubscriptionKeyEdit', {
			    url: '/api2/extjs/' + baseurl 
			});
			win.show();
			win.on('destroy', reload);
		    }
		},
		{
		    text: gettext('Check'),
		    handler: function() {
			PVE.Utils.API2Request({
			    params: { force: 1 },
			    url: baseurl,
			    method: 'POST',
			    waitMsgTarget: me,
			    failure: function(response, opts) {
				Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    },
			    callback: reload
			});
		    }
		},
		{
		    text: gettext('System Report'),
		    handler: function() {
			PVE.Utils.checked_command(function (){ me.showReport(); });
		    }
		}
	    ],
	    rows: rows,
	    listeners: {
		activate: reload
	    }
	});

	me.callParent();
    }
});
