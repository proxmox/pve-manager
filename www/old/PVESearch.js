Ext.ns("PVE");

PVE.Search = Ext.extend(Ext.grid.GridPanel, {

    initComponent : function() {

	var n = this.pveSelNode;
	var tree = n.getOwnerTree();
	var viewname = tree.viewname;

	//console.log("VIEW " + viewname);

	var groupfilter = [];

	while(n) {
	    //console.log("SELECT1 " + n.id + " ATTR " + n.attributes.itype  + " = " + n.attributes.groupbyid);
	    if (n.attributes.groupbyid && n.attributes.itype)
		groupfilter.unshift({ field: n.attributes.itype, value: n.attributes.groupbyid});
	    n = n.parentNode;
	}

	var store = PVE.Cache.searchstore;

	store.setGroupFilter(viewname, groupfilter);

	var textfilter = store.getTextFilter();
	
	var coldef = PVE.Utils.get_column_defaults(viewname);

	Ext.apply(this, {
	    title: 'Search',
	    store: PVE.Cache.searchstore,
	    border: false,
	    tbar: [
		{
		    text: "Create VM"
		}, '-',
		{
		    text: "Create Container"
		}, '-',
		{
		    text: "Add Storage"
		},
		'->', 'Search:', ' ',
		{
		    xtype: 'textfield',
		    width: 200,
		    value: textfilter,
		    enableKeyEvents: true,
		    listeners: {
			keyup: function(field, e) {
			    var v = field.getValue();
			    PVE.Cache.searchstore.setTextFilter.defer(100, PVE.Cache.searchstore, [v]);
			}
		    }
		}
	    ],
          //trackMouseOver: false,
	    colModel: new Ext.grid.ColumnModel({
		defaults: {
		    width: 200,
		    sortable: true
		},
		columns: coldef
	    }),

	    view: new Ext.ux.grid.BufferView({
	    //view: new Ext.grid.GridView({
		rowHeight: 36,
//	     	forceFit: true,
		// render rows as they come into viewable area.
		scrollDelay: false
	    }),

	    stateful: false,
            stateId: 'pveseachgrid'        
	});

	PVE.Search.superclass.initComponent.call(this);

    }
});

Ext.reg('pveSearch', PVE.Search);

