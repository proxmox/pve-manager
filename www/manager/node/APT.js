Ext.define('PVE.node.APT', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveNodeAPT'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    model: 'apt-pkglist',
	    groupField: 'Section',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/apt/update"
	    },
	    sorters: [
		{
		    property : 'Package',
		    direction: 'ASC'
		}
	    ]
	});

	var groupingFeature = Ext.create('Ext.grid.feature.Grouping', {
            groupHeaderTpl: '{[ "Section: " + values.name ]} ({rows.length} Item{[values.rows.length > 1 ? "s" : ""]})'
	});

	var rowBodyFeature = Ext.create('Ext.grid.feature.RowBody', {
            getAdditionalData: function (data, rowIndex, record, orig) {
                var headerCt = this.view.headerCt;
                var colspan = headerCt.getColumnCount();
                // Usually you would style the my-body-class in CSS file
                return {
                    rowBody: '<div style="padding: 1em">' + data.Description + '</div>',
                    rowBodyColspan: colspan
                };
	    }
	});

	var reload = function() {
	    store.load();
	};

	me.loadCount = 1; // avoid duplicate load mask
	PVE.Utils.monStoreErrors(me, store);

	var apt_command = function(cmd){
	    PVE.Utils.API2Request({
		url: "/nodes/" + nodename + "/apt/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
		success: function(response, opts) {
		    var upid = response.result.data;

		    var win = Ext.create('PVE.window.TaskViewer', { 
			upid: upid
		    });
		    win.show();
		    me.mon(win, 'close', reload);
		}
	    });
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var update_btn = new Ext.Button({
	    text: gettext('Update'),
	    handler: function(){
		PVE.Utils.checked_command(function() { apt_command('update'); });
	    }
	});

	var upgrade_btn = new PVE.button.Button({
	    text: gettext('Upgrade'),
	    dangerous: true,
	    confirmMsg: function(rec) {
		return gettext('Are you sure you want to upgrade this node?');
	    },
	    handler: function(){
		PVE.Utils.checked_command(function() { apt_command('upgrade'); });
	    }
	});

	var show_changelog = function(rec) {
	    if (!rec || !rec.data || !(rec.data.ChangeLogUrl && rec.data.Package)) {
		return;
	    }

	    var win = Ext.create('Ext.window.Window', {
		title: gettext('Changelog') + ": " + rec.data.Package,
		width: 800,
		height: 400,
		layout: 'fit',
		modal: true,
		items: {
		    xtype: 'component',
		    autoScroll: true,
		    style: {
			'background-color': 'white',
			'white-space': 'pre',
			padding: '10px'
		    },
		    loader: {
			url: "/api2/json/nodes/" + nodename + "/apt/changelog",
			params: {
			    name: rec.data.Package,
			    version: rec.data.Version
			},
			ajaxOptions: { method: 'GET' },
			renderer: function(loader, response, active) {
			    var result = Ext.decode(response.responseText);
			    if (result && result.data) {
				loader.getTarget().update(Ext.htmlEncode(result.data));
			    } else {
				console.dir(response);
			    }
			},
			autoLoad: true
		    }
		}
	    });
	    win.show();
	};

	var changelog_btn = new PVE.button.Button({
	    text: gettext('Changelog'),
	    selModel: sm,
	    disabled: true,
	    enableFn: function(rec) {
		if (!rec || !rec.data || !(rec.data.ChangeLogUrl && rec.data.Package)) {
		    return false;
		}
		return true;
	    },	    
	    handler: function(b, e, rec) {
		show_changelog(rec);
	    }
	});

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    selModel: sm,
            viewConfig: {
		stripeRows: false,
		emptyText: '<div style="display:table; width:100%; height:100%;"><div style="display:table-cell; vertical-align: middle; text-align:center;"><b>' + gettext('Your system is up to date.') + '</div></div>'
	    },
	    tbar: [ update_btn, upgrade_btn, changelog_btn ],
	    features: [ groupingFeature, rowBodyFeature ],
	    columns: [
		{
		    header: gettext('Package'),
		    width: 200,
		    sortable: true,
		    dataIndex: 'Package'
		},
		{
		    text: gettext('Version'),
		    columns: [
			{
			    header: gettext('current'),
			    width: 100,
			    sortable: false,
			    dataIndex: 'OldVersion'
			},
			{
			    header: gettext('new'),
			    width: 100,
			    sortable: false,
			    dataIndex: 'Version'
			}
		    ]
		},
		{
		    header: gettext('Description'),
		    sortable: false,
		    dataIndex: 'Title',
		    flex: 1
		}
	    ],
	    listeners: { 
		show: reload,
		itemdblclick: function(v, rec) {
		    show_changelog(rec);
		}
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('apt-pkglist', {
	extend: 'Ext.data.Model',
	fields: [ 'Package', 'Title', 'Description', 'Section', 'Arch',
		  'Priority', 'Version', 'OldVersion', 'ChangeLogUrl' ],
	idProperty: 'Package'
    });

});
