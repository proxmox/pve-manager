Ext.define('PVE.TaskViewer', {
    extend: 'PVE.Page',
    alias: 'widget.pveTaskViewer',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)\/tasks\/([^\s\/]+)$/);
	}
    },

    nodename: undefined,
    upid: undefined,
    taskInfo: undefined,
    taskStatus: 'running', // assume running

    config: {
	items: [
	    { 
		xtype: 'pveTitleBar'
	    },
	    {
		itemId: 'taskStatus',
		xtype: 'component',
		styleHtmlContent: true,
		style: 'background-color:white;',
		data: [],
		tpl: [
		    '<table style="margin-bottom:0px;">',
		    '<tpl for=".">',
		    '<tr><td>{key}</td><td>{value}</td></tr>',
		    '</tpl>',
		    '</table>'
		]
 	    },
	    {
		xtype: 'component',
		cls: 'dark',
 		padding: 5,
		html: gettext('Log')
	    },
	    {
		itemId: 'taskLog',
		xtype: 'container',
		flex: 1,
		scrollable: 'both',
		styleHtmlContent: true,
		style: 'background-color:white;white-space: pre;font-family: Monospace;',
		data: {},
		tpl: '{text}'
	    }
	]
    },

    reloadLog: function() {
	var me = this;

	var logCmp = me.down('#taskLog');

	PVE.Utils.API2Request({
	    url: "/nodes/" + me.nodename + "/tasks/" + me.upid + "/log",
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;

		var text = '';
		Ext.Array.each(d, function(el) {
		    text += Ext.htmlEncode(el.t) + "\n";
		});
		logCmp.setData({ text: text });
	    },
	    failure: function(response) {
		logCmp.setData({ text: response.htmlStatus } );
	    }
	});
    },

    reload: function() {
	var me = this;

	var statusCmp = me.down('#taskStatus');
	var logCmp = me.down('#taskLog');

	PVE.Utils.API2Request({
	    url: "/nodes/" + me.nodename + "/tasks/" + me.upid + "/status",
	    method: 'GET',
	    success: function(response) {
		me.reloadLog();

		var d = response.result.data;
		var kv = [];

		kv.push({ key: gettext('Taskstatus'), value: d.status });
		kv.push({ key: gettext('Node'), value: d.node });
		kv.push({ key: gettext('User'), value: d.user });
		kv.push({ key: gettext('Starttime'), value: PVE.Utils.render_timestamp(d.starttime) });

		me.setMasked(false);
		statusCmp.setData(kv);
		if (d.status !== 'stopped') {
		    Ext.defer(me.reload, 2000, me);
		}
	    },
	    failure: function(response) {
		me.setMasked({ xtype: 'loadmask', message: response.htmlStatus} );
	    }
	});
    },

   initialize: function() {
       var me = this;

       var match = me.self.pathMatch(me.getAppUrl());
       if (!match) {
	   throw "pathMatch failed";
       }

       me.nodename = match[1];
       me.upid = match[2];

       me.taskInfo = PVE.Utils.parse_task_upid(me.upid);

       me.down('titlebar').setTitle(me.taskInfo.desc);

       me.reload();

	this.callParent();
    }
});
